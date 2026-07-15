FROM diegosouzapw/omniroute:latest

USER root
RUN mkdir -p /data && chmod 777 /data

COPY sync.js /sync.js
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
