#!/bin/bash

# 🚀 Rekt CEO Enhanced Contracts - Local Setup Script
# This script sets up the local development environment and runs tests

echo "🚀 Setting up Rekt CEO Enhanced Contracts locally..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
check_node() {
    print_status "Checking Node.js installation..."
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js is installed: $NODE_VERSION"
        
        # Check if version is 16 or higher
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
        if [ "$NODE_MAJOR" -lt 16 ]; then
            print_error "Node.js version 16 or higher is required. Current version: $NODE_VERSION"
            print_status "Please update Node.js: https://nodejs.org/"
            exit 1
        fi
    else
        print_error "Node.js is not installed. Please install Node.js 16 or higher."
        print_status "Download from: https://nodejs.org/"
        exit 1
    fi
}

# Check if npm is installed
check_npm() {
    print_status "Checking npm installation..."
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_success "npm is installed: $NPM_VERSION"
    else
        print_error "npm is not installed. Please install npm."
        exit 1
    fi
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    if [ ! -d "node_modules" ]; then
        print_status "Running npm install..."
        npm install
        if [ $? -eq 0 ]; then
            print_success "Dependencies installed successfully"
        else
            print_error "Failed to install dependencies"
            exit 1
        fi
    else
        print_success "Dependencies already installed"
    fi
}

# Compile contracts
compile_contracts() {
    print_status "Compiling smart contracts..."
    npm run compile
    if [ $? -eq 0 ]; then
        print_success "Contracts compiled successfully"
    else
        print_error "Failed to compile contracts"
        exit 1
    fi
}

# Start local Hardhat node
start_local_node() {
    print_status "Starting local Hardhat node..."
    print_warning "This will start a local blockchain. Keep this terminal open!"
    print_status "The node will be available at http://127.0.0.1:8545"
    print_status "Press Ctrl+C to stop the node"
    echo ""
    
    # Start the node in background
    npx hardhat node &
    NODE_PID=$!
    
    # Wait a moment for the node to start
    sleep 3
    
    print_success "Local Hardhat node started (PID: $NODE_PID)"
    print_status "You can now run tests in another terminal:"
    print_status "npx hardhat run scripts/enhanced-test.js --network localhost"
    print_status "npx hardhat run scripts/enhanced-deploy.js --network localhost"
    
    # Keep the script running
    wait $NODE_PID
}

# Run tests
run_tests() {
    print_status "Running enhanced tests..."
    npx hardhat run scripts/enhanced-test.js --network localhost
    if [ $? -eq 0 ]; then
        print_success "Enhanced tests passed!"
    else
        print_error "Enhanced tests failed!"
        exit 1
    fi
}

# Deploy contracts
deploy_contracts() {
    print_status "Deploying enhanced contracts..."
    npx hardhat run scripts/enhanced-deploy.js --network localhost
    if [ $? -eq 0 ]; then
        print_success "Contracts deployed successfully!"
    else
        print_error "Contract deployment failed!"
        exit 1
    fi
}

# Main menu
show_menu() {
    echo ""
    echo "🎯 What would you like to do?"
    echo "1. Check system requirements"
    echo "2. Install dependencies"
    echo "3. Compile contracts"
    echo "4. Start local Hardhat node"
    echo "5. Run enhanced tests"
    echo "6. Deploy contracts locally"
    echo "7. Run everything (full setup)"
    echo "8. Exit"
    echo ""
    read -p "Enter your choice (1-8): " choice
}

# Full setup
full_setup() {
    print_status "Running full setup..."
    check_node
    check_npm
    install_dependencies
    compile_contracts
    print_success "Setup complete! Now you can:"
    print_status "1. Start local node: npx hardhat node"
    print_status "2. Run tests: npx hardhat run scripts/enhanced-test.js --network localhost"
    print_status "3. Deploy: npx hardhat run scripts/enhanced-deploy.js --network localhost"
}

# Main script
main() {
    echo "🎉 Welcome to Rekt CEO Enhanced Contracts Setup!"
    echo "=================================================="
    
    while true; do
        show_menu
        case $choice in
            1)
                check_node
                check_npm
                ;;
            2)
                install_dependencies
                ;;
            3)
                compile_contracts
                ;;
            4)
                start_local_node
                ;;
            5)
                run_tests
                ;;
            6)
                deploy_contracts
                ;;
            7)
                full_setup
                ;;
            8)
                print_success "Goodbye! 👋"
                exit 0
                ;;
            *)
                print_error "Invalid choice. Please enter 1-8."
                ;;
        esac
        echo ""
        read -p "Press Enter to continue..."
    done
}

# Run main function
main



