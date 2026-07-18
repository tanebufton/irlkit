variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "SSH public key for admin access"
  type        = string
}

variable "server_name" {
  type    = string
  default = "irlkit"
}

variable "server_type" {
  description = "Dedicated-vCPU CCX type. ccx13 = 2 vCPU/8GB (budget floor, low-cpu preset only), ccx23 = 4 vCPU/16GB (recommended for 1080p60), ccx33 = 8 vCPU (comfortable). Hetzner raised CCX pricing ~170% in June 2026 — DigitalOcean's equivalent c-2/c-4 droplets are now cheaper; see docs/deploy.md."
  type        = string
  default     = "ccx23"
}

variable "location" {
  description = "Hetzner location (nbg1, fsn1, hel1, ash, hil). Pick one near your audience/uplink."
  type        = string
  default     = "fsn1"
}

variable "repo_url" {
  type    = string
  default = "https://github.com/YOU/irlkit.git"
}

variable "domain" {
  description = "Hostname to point at the box for automatic TLS"
  type        = string
}

variable "acme_email" {
  type    = string
  default = "me@example.com"
}

variable "owner_username" {
  type    = string
  default = "owner"
}

variable "owner_password" {
  description = "Owner login password"
  type        = string
  sensitive   = true
}
