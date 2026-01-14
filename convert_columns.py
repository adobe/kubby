#!/usr/bin/env python3
import re

# Read the file
with open('src-tauri/src/resource_columns.rs', 'r') as f:
    content = f.read()

# Pattern to match ColumnConfig blocks
pattern = r'ColumnConfig \{\s+name: (.+?),\s+json_paths: (.+?),\s+format: (.+?),\s+column_type: (.+?),\s+\}'

def replace_fn(match):
    name = match.group(1)
    json_paths = match.group(2)
    format_val = match.group(3)
    column_type = match.group(4)
    
    return f'col!(\n                {name},\n                {json_paths},\n                {format_val},\n                {column_type}\n            )'

# Replace all ColumnConfig blocks
new_content = re.sub(pattern, replace_fn, content, flags=re.DOTALL)

# Write back
with open('src-tauri/src/resource_columns.rs', 'w') as f:
    f.write(new_content)

print("Converted all ColumnConfig instances to use col! macro")
