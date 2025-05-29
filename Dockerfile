FROM mcr.microsoft.com/devcontainers/php:1-8.2-bookworm

# Install system dependencies
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y mariadb-client supervisor \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Install Node.js and npm
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y nodejs

RUN npm install -g npm

# Install php-mysql driver    
RUN docker-php-ext-install mysqli pdo pdo_mysql

# Set working directory
WORKDIR /var/www/html

# Set default environment variables for MariaDB connection
ENV DB_HOST=localhost
ENV DB_PORT=3306
ENV DB_NAME=mariadb
ENV DB_USER=mariadb
ENV DB_PASSWORD=mariadb

# Copy package.json and install Node.js dependencies first (for better caching)
COPY package*.json ./
RUN npm install

# Copy all project files
COPY . .

# Create supervisor configuration for running both PHP and Node.js servers
RUN mkdir -p /var/log/supervisor
COPY <<EOF /etc/supervisor/conf.d/supervisord.conf
[supervisord]
nodaemon=true

[program:php-server]
command=php -S 0.0.0.0:8080 -t /var/www/html
stdout_logfile=/var/log/supervisor/php-server.log
stderr_logfile=/var/log/supervisor/php-server.log
autorestart=true

[program:node-server]
command=node server.js
directory=/var/www/html
stdout_logfile=/var/log/supervisor/node-server.log
stderr_logfile=/var/log/supervisor/node-server.log
autorestart=true
EOF

# Expose ports
EXPOSE 8080 3000

# Use supervisor to run both services
CMD ["/usr/bin/supervisord"] 