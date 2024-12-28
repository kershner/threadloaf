#!/bin/bash

# Format all TypeScript files using Prettier
echo "Formatting code..."
npx prettier --write "**/*.ts"

# Run TypeScript compiler
echo "Compiling TypeScript..."
npx tsc

# Check if compilation was successful
if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi 

# Copy static files to dist
cp -f manifest.json ../dist/manifest.json
cp -f styles.css ../dist/styles.css

echo "Build completed successfully!"
