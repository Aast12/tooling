resource "cloudflare_r2_bucket" "filebundle" {
  account_id = var.cloudflare_account_id
  name       = "filebundle"
}
