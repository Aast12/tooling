# Worker scripts are deployed via `wrangler deploy` (Astro build output for the
# main worker, and the sweep worker under ./sweep). Terraform manages the
# custom-domain binding that attaches files.alamst.me to the `filebundle` Worker.
#
# This resource will fail on first apply if the Worker script has never been
# deployed. Deploy order: `terraform apply` (R2 + D1) → copy d1 id into
# wrangler.toml → `wrangler deploy` (both workers) → `terraform apply` again
# (custom domain binding).

resource "cloudflare_workers_custom_domain" "filebundle" {
  account_id  = var.cloudflare_account_id
  zone_id     = data.cloudflare_zone.domain.id
  hostname    = "${var.subdomain}.${var.domain}"
  service     = "filebundle"
  environment = "production"
}
