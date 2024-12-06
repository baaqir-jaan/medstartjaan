# 1. Create React project
npm create vite@latest physician-lookup-frontend -- --template react
cd physician-lookup-frontend

# 2. Install dependencies
npm install
npm install @radix-ui/react-alert-dialog @radix-ui/react-slot lucide-react class-variance-authority clsx tailwindcss postcss autoprefixer

# 3. Initialize Tailwind CSS
npx tailwindcss init -p   # This creates tailwind.config.js and postcss.config.js

# 4. Create the component directories
mkdir -p src/components/ui

# 5. Create the component files
touch src/components/ui/alert.jsx
touch src/components/ui/card.jsx