# LetsDoTogether Backend 🚀

<div align="center">
  <h3>A modern API for connecting people through shared activities.</h3>
</div>

---

## Welcome
Welcome to the **LetsDoTogether Backend** repository! This is the robust API that powers the LetsDoTogether platform. It handles everything from secure user authentication and personalized activity recommendations to real-time chat, notifications, and media management.

## Features
- **Secure Authentication**: Traditional Email/Password with OTP verification and seamless Google OAuth integration.
- **Activity Recommendations**: Smart suggestions based on user preferences and location.
- **Connections & Social Graph**: Send, accept, and manage friend requests and connections.
- **Real-time Chat**: WebSocket-powered instant messaging between connected users.
- **Push Notifications**: Real-time alerts for messages, connection requests, and system events.
- **Media Uploads**: Cloudinary integration for profile pictures and activity images.

## About (Tech Stack)
This project is engineered for high scalability and performance, utilizing a modern TypeScript ecosystem:

- **Core Framework**: [NestJS](https://nestjs.com/) (TypeScript)
- **Database**: PostgreSQL hosted on [Neon Serverless](https://neon.tech/)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Caching & Pub/Sub**: Redis hosted on [Upstash](https://upstash.com/) (using `ioredis`)
- **Authentication**: JWT (Access & Refresh token rotation), Passport.js
- **Emails**: [Resend API](https://resend.com/) for transactional emails
- **Media Storage**: [Cloudinary](https://cloudinary.com/)
- **Deployment**: Google Cloud Run with automated CI/CD via GitHub Actions

---

## Get Started for Contributors

To get a local development environment up and running, follow these steps:

### 1. Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- A local or remote PostgreSQL database (or Neon)
- A local or remote Redis instance (or Upstash)

### 2. Clone the repository
```bash
git clone <your-repo-url>
cd letsDoTogether
```

### 3. Install dependencies
```bash
npm install
```

### 4. Set up Environment Variables
Copy the example environment file and fill in your keys:
```bash
cp .env.example .env
```
**Key Environment Variables to configure:**
- `DATABASE_URL`: Your PostgreSQL connection string.
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Your Redis connection details.
- `REDIS_TLS`: Set to `true` if using Upstash.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: Secure random strings for token signing.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: For OAuth login.
- `RESEND_API_KEY`: For sending verification and password reset emails.
- `CLOUDINARY_*`: For image uploads.

### 5. Initialize the Database
Generate the Prisma client and sync your database schema:
```bash
npx prisma generate
npx prisma db push
```

### 6. Start the Development Server
```bash
# Watch mode (recommended for development)
npm run start:dev

# Standard mode
npm run start
```
The API will be available at `http://localhost:3000`. 

---

## API Documentation
This project uses **Swagger** for automatic API documentation. 
Once the server is running, navigate to:
👉 **`http://localhost:3000/api-docs`**

You can view all available endpoints, required payloads, and even test the API directly from your browser.

---

## Available Scripts

- `npm run start:dev` - Start the app in watch mode for development.
- `npm run build` - Build the app for production into the `dist/` folder.
- `npm run start:prod` - Run the compiled production build.
- `npm run lint` - Run ESLint to find and fix code style issues.
- `npm run format` - Run Prettier to format the codebase.
- `npx prisma studio` - Open a web GUI to view and edit your database records.

---

## Deployment
This project is configured for automated deployment to **Google Cloud Run**.
- Any push to the `main` branch triggers the GitHub Actions workflow (`deploy.yml`).
- The workflow builds a highly optimized Docker image using a multi-stage Dockerfile.
- The image is pushed to Google Artifact Registry and deployed to Cloud Run with zero downtime.

---

## Issues
If you encounter a bug or have a feature request, please check the existing issues before opening a new one. 

**When submitting an issue, please include:**
- A clear and descriptive title.
- Exact steps to reproduce the bug (if applicable).
- Expected vs. actual behavior.
- Any relevant logs, screenshots, or code snippets.

---

## Guidelines
We welcome contributions! To keep the codebase clean and maintainable, please adhere to the following guidelines:

- **Code Style**: We use Prettier and ESLint. Please ensure your code passes formatting checks by running `npm run lint` and `npm run format` before committing.
- **Branching Strategy**: Create a specific branch for your work. Use descriptive prefixes:
  - `feature/` for new features (e.g., `feature/user-profiles`)
  - `fix/` for bug fixes (e.g., `fix/cors-error`)
  - `docs/` for documentation updates
- **Commit Messages**: Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification (e.g., `feat: add user recommendation endpoint`, `fix: resolve CORS issue on auth callback`).
- **Pull Requests**: Submit your PRs against the `main` branch. Provide a clear description of the changes and link any related issues. Ensure that the project builds successfully before requesting a review.
