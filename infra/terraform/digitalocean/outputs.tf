output "ipv4" {
  description = "Public IPv4 — point your DNS A record here."
  value       = digitalocean_droplet.irlkit.ipv4_address
}

output "studio_url" {
  value = "https://${var.domain}"
}

output "next_steps" {
  value = "Create an A record: ${var.domain} -> ${digitalocean_droplet.irlkit.ipv4_address}, then wait ~5 min for the stack to build and TLS to issue."
}
