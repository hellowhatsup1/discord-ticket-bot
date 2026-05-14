# Use official Node.js image
FROM node:20

# Set working directory inside container
WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your project
COPY . .

# Expose port if needed (optional, for web servers)
# EXPOSE 3000

# Start the bot
CMD ["npm", "start"]
