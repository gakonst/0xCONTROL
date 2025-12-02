use analyzer_rust::{init_tracing, run};
use std::env;
use tracing::error;

#[tokio::main]
async fn main() {
    init_tracing();

    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse()
        .unwrap_or(3000);

    if let Err(err) = run(port).await {
        error!("server error: {err}");
    }
}
