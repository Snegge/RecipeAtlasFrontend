# Combined Render image

The backend owns the combined Dockerfile and release workflow. From the backend checkout run:

```
python scripts/build_cloud.py --frontend /absolute/path/to/RecipeAtlasFrontend --tag recipoke:local
```

The script stages an allowlist from both repositories into one temporary context. Angular builds with npm ci and its production service worker; ASP.NET Core serves dist/recipoke under the same origin. Do not copy .env files into the frontend or add database credentials to Angular configuration. See the backend docs/cloud-deployment.md for schema, keys, release and Render configuration.
