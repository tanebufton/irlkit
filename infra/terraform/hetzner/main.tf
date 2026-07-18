# Provision an irlkit box on Hetzner Cloud (dedicated-vCPU CCX line — the sweet
# spot for x264 1080p60 on a budget).
terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.48"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

resource "hcloud_ssh_key" "admin" {
  name       = "irlkit-admin"
  public_key = var.ssh_public_key
}

resource "hcloud_firewall" "irlkit" {
  name = "irlkit"

  # tcp: SSH, web+TLS, RTMP ingest   /   udp: SRT, SRTLA, WebRTC preview
  dynamic "rule" {
    for_each = toset(["22", "80", "443", "1935"])
    content {
      direction  = "in"
      protocol   = "tcp"
      port       = rule.value
      source_ips = ["0.0.0.0/0", "::/0"]
    }
  }

  dynamic "rule" {
    for_each = toset(["4001", "5000", "8189"])
    content {
      direction  = "in"
      protocol   = "udp"
      port       = rule.value
      source_ips = ["0.0.0.0/0", "::/0"]
    }
  }
}

resource "hcloud_server" "irlkit" {
  name         = var.server_name
  server_type  = var.server_type # e.g. ccx23 (4 dedicated vCPU) or ccx33 (8)
  image        = "ubuntu-24.04"
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.admin.id]
  firewall_ids = [hcloud_firewall.irlkit.id]

  user_data = templatefile("${path.module}/../../cloud-init/bootstrap.sh.tmpl", {
    repo_url       = var.repo_url
    domain         = var.domain
    acme_email     = var.acme_email
    owner_username = var.owner_username
    owner_password = var.owner_password
  })
}
