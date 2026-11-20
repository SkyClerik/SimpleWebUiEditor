import sys
import os
import json

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def read_file(path, start=None, end=None):
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()
    if start is not None and end is not None:
        lines = lines[int(start)-1 : int(end)]
    offset = int(start) if start else 1
    for i, line in enumerate(lines, start=offset):
        print(f"{i}: {line}", end="")

def write_file(path, json_text, mode='w'):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    text = json.loads(json_text)
    with open(path, mode, encoding='utf-8') as f:
        f.write(text)
    print("OK")

def replace_lines(path, start, end, json_text):
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    new_text = json.loads(json_text)
    if new_text and not new_text.endswith('\n'):
        new_text += '\n'
    
    lines[int(start)-1 : int(end)] = [new_text]
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("OK")

if __name__ == "__main__":
    cmd = sys.argv
    if cmd == "read":
        read_file(sys.argv, sys.argv if len(sys.argv)>3 else None, sys.argv if len(sys.argv)>4 else None)
    elif cmd == "write":
        write_file(sys.argv, sys.argv, 'w')
    elif cmd == "append":
        write_file(sys.argv, sys.argv, 'a')
    elif cmd == "replace":
        replace_lines(sys.argv, sys.argv, sys.argv, sys.argv)
