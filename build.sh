#!/bin/bash

# Format all TypeScript files using Prettier
echo "Formatting code..."
npx prettier --write "**/*.ts"

# Run TypeScript compiler
echo "Compiling TypeScript..."
npx tsc

# Check if compilation was successful
if [ $? -eq 0 ]; then
    echo "Build completed successfully!"
else
    echo "Build failed!"
    exit 1
fi 