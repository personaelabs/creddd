use crate::{
    address_groups::AddressGroups,
    eth_rpc::EthRpcClient,
    group::{update_group_state, Group},
    processors::GroupIndexer,
    tree::{build_tree, get_group_latest_merkle_tree, save_tree, update_tree_block_num},
    utils::to_hex,
    Address, BlockNum, Error, GroupState, IndexerError,
};
use log::{error, info};
use rand::{rngs::OsRng, seq::SliceRandom};
use std::{collections::HashSet, sync::Arc};
use tokio::sync::Semaphore;

const INDEXING_INTERVAL_SECS: u64 = 300; // 5 minutes

pub struct TreeSyncEngine {
    pub indexer: Box<dyn GroupIndexer>,
    pub group: Group,
    pub pg_client: Arc<tokio_postgres::Client>,
    pub rocksdb_client: Arc<rocksdb::DB>,
    pub eth_client: Arc<EthRpcClient>,
    pub semaphore: Arc<Semaphore>,
}

impl TreeSyncEngine {
    pub fn new(
        indexer: Box<dyn GroupIndexer>,
        group: Group,
        pg_client: Arc<tokio_postgres::Client>,
        rocksdb_client: Arc<rocksdb::DB>,
        eth_client: Arc<EthRpcClient>,
        semaphore: Arc<Semaphore>,
    ) -> Self {
        TreeSyncEngine {
            indexer,
            group,
            pg_client,
            rocksdb_client,
            eth_client,
            semaphore,
        }
    }
}

impl TreeSyncEngine {
    fn save_address_groups(&self, addresses: &[Address]) {
        let group_id_bytes = hex::decode(&self.group.id).unwrap();

        if group_id_bytes.len() != 32 {
            panic!("Invalid group id length");
        }

        let group_id_bytes: [u8; 32] = group_id_bytes.try_into().unwrap();

        // Update the address -> group ids mapping
        for address in addresses {
            let address_groups = AddressGroups::get(*address, self.rocksdb_client.clone());

            if let Some(mut address_groups) = address_groups {
                // Record already exists
                // Add the group id and save
                address_groups.add_group(group_id_bytes);
                address_groups.save();
            } else {
                // Record does not exist, create a new one
                let mut group_ids = HashSet::<[u8; 32]>::new();
                group_ids.insert(group_id_bytes);

                AddressGroups::create(*address, group_ids, self.rocksdb_client.clone());
            }
        }
    }

    /// Sync the tree to a specific block number
    async fn sync_to_block(&self, block_number: BlockNum) -> Result<(), Error> {
        // Get the members of the group at the given block number
        let members = self.indexer.get_members(block_number).await?;

        // Convert the members to a vector
        let mut members = members.iter().copied().collect::<Vec<Address>>();

        // Build the merkle tree
        let merkle_tree = build_tree(self.group.id.clone(), self.group.group_type, &mut members);

        if merkle_tree.is_none() {
            return Ok(());
        }

        let merkle_tree = merkle_tree.unwrap();

        // Get the latest merkle root for the group
        let group_latest_merkle_tree =
            get_group_latest_merkle_tree(self.group.id.clone(), &self.pg_client).await?;

        // Compare the latest merkle root with the new merkle root.
        // If they are the same, then the tree is already up to date
        // and we don't need to save the new tree.
        if let Some((tree_id, merkle_root)) = group_latest_merkle_tree {
            if merkle_root == to_hex(merkle_tree.root.unwrap()) {
                info!(
                    "${} Tree already up to date at block {}",
                    self.group.name, block_number
                );

                // Update the block number of the tree
                update_tree_block_num(tree_id, block_number, &self.pg_client).await?;

                // Update the address -> group ids mapping
                self.save_address_groups(&members);

                return Ok(());
            }
        }

        // New Merkle tree detected

        // Sanity check the eligibility of a few members
        let mut rng = OsRng::default();
        let members_to_check: Vec<Address> =
            members.choose_multiple(&mut rng, 5).cloned().collect();

        let sanity_check_result = self
            .indexer
            .sanity_check_members(&members_to_check, block_number)
            .await?;

        if !sanity_check_result {
            error!(
                "${} Sanity check failed for block {}",
                self.group.name, block_number
            );
        } else {
            save_tree(
                &members,
                merkle_tree,
                self.group.id.clone(),
                &self.pg_client,
                block_number as i64,
            )
            .await?;

            // Update the address -> group ids mapping
            self.save_address_groups(&members);
        }

        Ok(())
    }

    /// Start the sync job
    pub async fn sync(&self) {
        loop {
            let permit = self.semaphore.acquire().await;

            if permit.is_err() {
                error!("${} Semaphore acquire error: {:?}", self.group.name, permit);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }

            let permit = permit.unwrap();

            // Check if the indexer is ready or not

            let is_ready = self.indexer.is_ready().await;

            if is_ready.is_err() {
                drop(permit);
                error!(
                    "${} Error checking if indexer is ready: {:?}",
                    self.group.name,
                    is_ready.err().unwrap()
                );
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }

            if !is_ready.unwrap() {
                drop(permit);
                info!("${} Waiting for the indexer...", self.group.name);
                tokio::time::sleep(std::time::Duration::from_secs(INDEXING_INTERVAL_SECS)).await;
                continue;
            }

            // Get the latest block number
            let latest_block = self.eth_client.get_block_number(self.indexer.chain()).await;

            if latest_block.is_err() {
                drop(permit);
                error!(
                    "${} get_block_number Error: {:?}",
                    self.group.name,
                    latest_block.err().unwrap()
                );
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                continue;
            }

            let latest_block = latest_block.unwrap();

            // Sync to the latest block
            let sync_to_block_result = self.sync_to_block(latest_block).await;

            // If `get_members` return incorrect state error,
            // mark the group as unrecordable and break the loop

            match sync_to_block_result {
                Ok(_) => {}
                Err(Error::Indexer(IndexerError::InvalidBalance)) => {
                    error!("${} Invalid balance {:?}", self.group.name, latest_block);
                    drop(permit);

                    // TODO: Propagate the error to the caller
                    update_group_state(&self.pg_client, &self.group.id, GroupState::Unrecordable)
                        .await
                        .unwrap();

                    break;
                }
                Err(err) => {
                    error!(
                        "${} Error syncing to block {}: {:?}",
                        self.group.name, latest_block, err
                    );
                }
            }

            drop(permit);

            tokio::time::sleep(std::time::Duration::from_secs(INDEXING_INTERVAL_SECS)).await;
        }
    }
}
