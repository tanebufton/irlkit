variable "do_token" {
  description = "DigitalOcean API token"
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

variable "droplet_size" {
  description = "CPU-Optimized (dedicated) size. c-2 = 2 vCPU/4GB (~$42/mo, budget floor, low-cpu preset only), c-4 = 4 vCPU/8GB (~$84/mo, recommended for 1080p60), c-8 = 8 vCPU (comfortable). See docs/deploy.md for current pricing."
  type        = string
  default     = "c-4"
}

variable "region" {
  description = "DO region slug (nyc3, ams3, fra1, sfo3, sgp1, …). Pick one near you."
  type        = string
  default     = "ams3"
}

variable "repo_url" {
  type    = string
  default = "https://github.com/tanebufton/irlkit.git"
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
