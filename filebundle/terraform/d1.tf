resource "cloudflare_d1_database" "filebundle" {
  account_id = var.cloudflare_account_id
  name       = "filebundle"
}

output "d1_database_id" {
  value       = cloudflare_d1_database.filebundle.id
  description = "Copy this into wrangler.toml's database_id field after first apply."
}
