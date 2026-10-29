# Production deployment

The `deploy.yml` workflow validates every push to `main`. It deploys only when
the repository Actions variable `COUGAR_LIVE_DEPLOY_ENABLED` is exactly
`true`. The variable must remain unset or `false` until the new SYSTEM service
has passed stage validation and an approved cutover has been confirmed healthy.

The workflow targets only `main`; pushes to feature branches and pull request
branches do not deploy. The `production-main` environment must remain restricted
to the `main` branch and hold these environment secrets:

- `COUGAR_SSH_PRIVATE_KEY`: private key for the restricted Actions SSH account.
- `COUGAR_SSH_KNOWN_HOSTS`: verified SSH host-key entry for the production host.
- `COUGAR_SSH_HOST`: public hostname or address reachable by GitHub-hosted runners.
- `COUGAR_SSH_PORT`: existing SSH port.

The server verifies the requested revision against the current protected
`main` tip before exporting it. The release manager builds and tests in a
separate release directory, checks the revision health endpoint after
activation, and rolls back on failure. Concurrent runs serialize; a superseded
revision is rejected rather than activated.

Before enabling `COUGAR_LIVE_DEPLOY_ENABLED`, run the manual preflight
workflow's `probe` and `stage` operations, complete the approved cutover, and
verify the new SYSTEM service and public application behavior. To stop
automatic deployments later, unset the variable or set it to `false`.
