#!/bin/bash
# Nexvo dev server startup script
cd "$(dirname "$0")"
export PORT=3000
exec npx next dev -p 3000
