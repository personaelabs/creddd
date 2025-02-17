use crate::BlockNum;
use jsonrpc_http_server::jsonrpc_core::{Error as JsonRpcError, Params, Value};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerkleTreeData {
    pub block_number: BlockNum,
}

pub async fn get_group_merkle_tree(
    params: Params,
    pg_client: &tokio_postgres::Client,
) -> Result<Value, JsonRpcError> {
    let params: Vec<String> = params.parse().unwrap();

    if params.len() != 2 {
        return Err(JsonRpcError::invalid_params("Expected 2 parameter"));
    }

    let merkle_root = params[0].clone();
    let group_id = params[1].clone();

    let result = pg_client
        .query(
            r#"
            SELECT
                "blockNumber"
            FROM
                "MerkleTree"
            WHERE
                "merkleRoot" = $1
                AND "groupId" = $2
            "#,
            &[&merkle_root, &group_id],
        )
        .await;

    if result.is_err() {
        return Err(JsonRpcError::internal_error());
    }

    let rows = result.unwrap();

    if rows.len() == 0 {
        return Err(JsonRpcError::invalid_params(
            "No Merkle tree found for the given Merkle root and group id",
        ));
    }

    let row = rows.get(0).unwrap();

    let block_number: i64 = row.get("blockNumber");

    let merkle_tree_data = MerkleTreeData {
        block_number: block_number as BlockNum,
    };

    Ok(json!(merkle_tree_data))
}
