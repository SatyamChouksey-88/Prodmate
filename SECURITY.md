# Security

## Reporting

Open a [GitHub issue](https://github.com/SatyamChouksey-88/Prodmate/issues) for vulnerabilities or sensitive data accidentally committed. Do not post API keys, Gemini keys, or tracker PATs in the issue body.

## Secrets

- Never commit `.env`, `.env.local`, or real values in example env files.
- **Gemini API keys** belong on the server (`backend/` `GEMINI_API_KEY`) in API mode — not in the frontend bundle.
- **Azure DevOps PATs**, **Jira API tokens**, and similar tracker credentials must not be committed to this repository.
- CI runs [Gitleaks](https://github.com/gitleaks/gitleaks) on full git history for pushes and pull requests.

## Demo / insecure client mode

Local-only demo mode can store tracker configuration (including PATs) in browser **localStorage**. That path is unsafe for shared or production use. See the **Security model** section in `README.md`.
