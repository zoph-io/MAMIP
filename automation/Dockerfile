FROM public.ecr.aws/amazonlinux/amazonlinux:latest

# Install dependencies
RUN yum update -y && \
    yum install -y git jq

ENV AWS_REGION=eu-west-1

RUN groupadd -r mamipg && useradd --no-log-init -r -g mamipg mamip
USER mamip

WORKDIR /app

COPY --chown=mamip:mamipg script-fargate.sh /app/script.sh
RUN chmod +x /app/script.sh

CMD ["bash", "script.sh"]
