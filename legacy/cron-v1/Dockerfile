FROM alpine:3.19

# Install curl and dcron
RUN apk add --no-cache curl dcron tzdata

# Set timezone
ENV TZ=Europe/Paris

# Copy crontab
COPY crontab /etc/crontabs/root

# Create log file
RUN mkdir -p /var/log && touch /var/log/cron.log

# Run dcron in foreground, tail log so container stays alive
CMD ["sh", "-c", "crond -f -l 8 -L /var/log/cron.log"]
