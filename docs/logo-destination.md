# Logo destination preference

Apply `database/010_logo_destination.sql` after migrations 001–009, then restart
the server. The migration reuses `User.launchPreference` for `/` or `/home` and
resets the retired screen names to `/`. New accounts default to `/`.

Settings → App preferences offers two radio buttons. The selection is saved
through the authenticated `save_launch` RPC and affects Cougar Connect brand
links, including the landing page footer. Login and onboarding destinations
are independent of this preference.

App pages apply the preference with account data. Public pages without an
account lookup resolve it on a normal logo click. Signed-out visitors and
failed lookups fall back to `/`.
