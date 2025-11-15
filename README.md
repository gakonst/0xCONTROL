# zero-control
A PID Controller implementation in Solidity.

## Development

This project now uses [Bun](https://bun.sh) for package management and scripts in order to keep dependency installs and CI fast.

```bash
# install dependencies
bun install

# start the local dev server
bun run dev

# create a production build
bun run build

# deploy via Cloudflare Wrangler
bun run deploy
```

`bun run deploy` simply wraps the build followed by `bunx wrangler deploy`, so you can continue to use Wrangler directly if you prefer (`bunx wrangler deploy --help`).
