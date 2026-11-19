FROM postgres:18-alpine
RUN apk add --no-cache bash restic rclone jq python3
COPY incremental-backup.py /opt/ponte/incremental-backup.py
COPY backup-database.sh /opt/ponte/backup-database.sh
COPY restore-database.sh /opt/ponte/restore-database.sh
COPY rehearse-recovery.sh /opt/ponte/rehearse-recovery.sh
ENTRYPOINT ["bash", "/opt/ponte/backup-database.sh"]
