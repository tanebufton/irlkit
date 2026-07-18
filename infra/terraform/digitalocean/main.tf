# Provision an irlkit box on DigitalOcean (CPU-Optimized / dedicated droplet —
# needed for stable x264 1080p60; shared droplets will drop frames).
terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.40"
    }
  }
}

provider "digitalocean" {
  token = var.do_token
}

resource "digitalocean_ssh_key" "admin" {
  name       = "irlkit-admin"
  public_key = var.ssh_public_key
}

resource "digitalocean_droplet" "irlkit" {
  name     = var.server_name
  region   = var.region
  size     = var.droplet_size # e.g. c-4 (4 dedicated vCPU) or c-8 (8)
  image    = "ubuntu-24-04-x64"
  ssh_keys = [digitalocean_ssh_key.admin.fingerprint]

  user_data = templatefile("${path.module}/../../cloud-init/bootstrap.sh.tmpl", {
    repo_url       = var.repo_url
    domain         = var.domain
    acme_email     = var.acme_email
    owner_username = var.owner_username
    owner_password = var.owner_password
  })
}

resource "digitalocean_firewall" "irlkit" {
  name        = "irlkit"
  droplet_ids = [digitalocean_droplet.irlkit.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
  inbound_rule {
    protocol         = "tcp"
    port_range       = "1935"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
  # SRT (4001), SRTLA (5000), WebRTC (8189) — UDP
  inbound_rule {
    protocol         = "udp"
    port_range       = "4001"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
  inbound_rule {
    protocol         = "udp"
    port_range       = "5000"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
  inbound_rule {
    protocol         = "udp"
    port_range       = "8189"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range           = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
  outbound_rule {
    protocol              = "udp"
    port_range           = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}
