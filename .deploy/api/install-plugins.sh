#!/bin/bash

PLUGINS_DIR="dist/packages/plugins"
NODE_MODULES_DIR="plugins_node_modules"

# Ensure that the node_rodules directory exists
mkdir -p "$NODE_MODULES_DIR"

# Traverse the plugins directory
for plugin in "$PLUGINS_DIR"/*; do
  if [ -d "$plugin" ]; then
    # Read the name field of packagejson
    PACKAGE_JSON="$plugin/package.json"
    if [ -f "$PACKAGE_JSON" ]; then
      PACKAGE_NAME=$(jq -r '.name' "$PACKAGE_JSON")
      if [ -n "$PACKAGE_NAME" ]; then
        # Create target directory and copy plugin
        TARGET_DIR="$NODE_MODULES_DIR/$PACKAGE_NAME"
        mkdir -p "$(dirname "$TARGET_DIR")"
        cp -r "$plugin" "$TARGET_DIR"
        echo "Copy $plugin to $TARGET_DIR"
      else
        echo "Warn: $PACKAGE_JSON has no name field, skip!"
      fi
    else
      echo "Warn: $PACKAGE_JSON not exist, skip!"
    fi
  fi
done