# Contribution Guidelines

Welcome to the team! To keep our codebase clean, organized, and easy to navigate, we follow strict conventions for branch naming and commit messages. Please review these guidelines before starting any work.

## 🌿 Branch Naming Conventions

All branches should be created off of the `develop` branch (unless they are hotfixes for production). 

Please use the following format for your branch names:
`type/scope/short-description`

### 1. Type
* `feat`: A new feature
* `fix`: A bug fix
* `chore`: Routine tasks, maintenance, or dependency updates
* `refactor`: Code changes that neither fix a bug nor add a feature
* `docs`: Documentation changes only

### 2. Scope
Indicate which part of the stack this branch primarily affects:
* `frontend`
* `backend`
* `fullstack` (if the branch requires changes in both)
* `infra` (for CI/CD or docker changes)

### 3. Description
Use lowercase letters and hyphens `-` to separate words. Keep it short and descriptive.

**✅ Good Examples:**
* `feat/frontend/create-profile-page`
* `fix/backend/auth-token-crash`
* `chore/fullstack/update-dependencies`

**❌ Bad Examples:**
* `my-new-feature`
* `frontend-fix`
* `Patch1`

---

## 📝 Commit Message Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This helps us automatically generate changelogs and understand project history at a glance.

Please use the following format for your commit messages:
`type(scope): subject`

### 1. Type
Use the same types as branch names: `feat`, `fix`, `chore`, `refactor`, `docs`, `style`, `test`.

### 2. Scope (Optional but Recommended)
Indicate the specific part of the app you worked on.
* `(frontend)`
* `(backend)`
* `(shared)`

### 3. Subject
* Use the imperative, present tense: "change" not "changed" nor "changes".
* Don't capitalize the first letter.
* No dot (.) at the end.

**✅ Good Examples:**
* `feat(frontend): add redirect to profile creation after login`
* `fix(backend): resolve null pointer in auth service`
* `chore(shared): update typescript version`
* `style(frontend): fix padding on landing page hero section`

**❌ Bad Examples:**
* `fixed a bug`
* `Updated backend auth`
* `wip`

---

## Google OAuth — Local Development

Production and local development use **different** OAuth configurations.

> ⚠️ **Never** share the production Google OAuth credentials publicly or commit them to the repository.

### Setup

For local development, create your own Google OAuth credentials in Google Cloud and configure a `localhost` callback URL.

Example `.env.local`:

```env
GOOGLE_CLIENT_ID=your-local-client-id
GOOGLE_CLIENT_SECRET=your-local-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback
```

### Important Notes

- The callback URL must **exactly match** the authorized redirect URI configured for your Google OAuth client.
- Check the existing authentication implementation for the exact callback route before configuring Google Cloud.
- Each contributor should use their **own** local OAuth credentials rather than sharing production credentials.

### Do Not Commit

Make sure the following are never committed to the repository:

- `.env`
- `.env.local`
- `client_secret.json`
- Google OAuth secrets
- JWT secrets
- Database credentials
- Redis credentials
- Cloudinary secrets
- API keys

## 🚀 Workflow Summary

1. **Pull the latest `develop` branch:**
   ```bash
   git checkout develop
   git pull origin develop
   ```
2. **Create your feature branch:**
   ```bash
   git checkout -b feat/frontend/my-awesome-feature
   ```
3. **Make your changes and commit using proper naming:**
   ```bash
   git commit -m "feat(frontend): add my awesome feature"
   ```
4. **Push your branch and open a Pull Request:**
   ```bash
   git push -u origin feat/frontend/my-awesome-feature
   ```
5. **Set the base branch of your PR to `develop`.** (Do not target `main` directly unless it's a production hotfix).
