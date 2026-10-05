"""Operator-only one-shot purge of expired minimal chat metadata; logs counts only."""
import argparse
import os

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args()
    import psycopg
    with psycopg.connect(os.environ['DATABASE_URL']) as db:
        count=db.execute('select count(*) from kerja_private.chat_metadata where expires_at<now()').fetchone()[0]
        if not args.dry_run:
            count=db.execute('delete from kerja_private.chat_metadata where expires_at<now()').rowcount
        print(f"Expired chat metadata {'due' if args.dry_run else 'deleted'}: {count}")

if __name__=='__main__':
    main()
