FROM public.ecr.aws/amazonlinux/amazonlinux:latest

# Install dependencies
RUN yum update -y && \
    yum install -y \
    git \
    jq \
    aws-cli \
    findutils \
    openssh-clients

# Set environment variable
ENV AWS_REGION=eu-west-1

# Create a group and user for running the script
RUN groupadd -r mamipg && useradd --no-log-init -r -g mamipg -m -d /home/mamip mamip
USER mamip

# Set working directory
WORKDIR /app

# Copy the script into the container
COPY --chown=mamip:mamipg script-fargate.sh /app/script.sh
RUN chmod +x /app/script.sh

# Create .ssh directory for the user
RUN mkdir -p /home/mamip/.ssh

# Define the command to run the script
CMD ["bash", "script.sh"]
