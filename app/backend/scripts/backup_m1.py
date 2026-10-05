"""Encrypt a complete pg_dump plus operator-exported object directory.

This runs locally, not in Railway. No backup is created unless credentials,
pg_dump and the complete private/legacy object export are available.
"""
import argparse
import io
import os
from pathlib import Path
import subprocess
import zipfile
from cryptography.fernet import Fernet


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--objects", type=Path, required=True)
    args = parser.parse_args()
    if not args.objects.is_dir():
        raise SystemExit("Export both private bucket objects and legacy uploads first")
    # Credentials are passed through environment, never command arguments/output.
    task_env = dict(os.environ, PGDATABASE=os.environ["DATABASE_URL"])
    result = subprocess.run(["pg_dump", "--format=custom", "--no-owner", "--no-acl"],
                            env=task_env, capture_output=True)
    if result.returncode:
        raise SystemExit("Database export failed; no backup written")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("database.dump", result.stdout)
        for file in args.objects.rglob("*"):
            if file.is_file() and not file.is_symlink():
                archive.write(file, "objects/" + file.relative_to(args.objects).as_posix())
    with args.output.open("xb") as output:
        output.write(Fernet(os.environ["M1_BACKUP_KEY"].encode()).encrypt(buffer.getvalue()))
    print("Encrypted database/object backup saved. Restore rehearsal is still required.")


if __name__ == "__main__":
    main()
