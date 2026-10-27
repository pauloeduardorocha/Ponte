FROM postgres:18-alpine
RUN apk add --no-cache bash restic rclone
COPY backup-database.sh /opt/ponte/backup-database.sh
COPY restore-database.sh /opt/ponte/restore-database.sh
ENTRYPOINT ["bash", "/opt/ponte/backup-database.sh"]
