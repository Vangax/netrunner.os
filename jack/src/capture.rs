use pcap::{Device, Capture, Active};
use protocol::net::NetPacket;
use chrono::Utc;
use std::net::{IpAddr, Ipv4Addr};
use anyhow::{anyhow, Result};

pub fn select_default_interface() -> Result<Device> {
    let devices = Device::list()?;
    if devices.is_empty() {
        return Err(anyhow!("No network interfaces found via Npcap"));
    }
    
    for device in &devices {
        if !device.addresses.is_empty() && device.name != "\\Device\\NPF_Loopback" {
            for addr in &device.addresses {
                if let IpAddr::V4(ipv4) = addr.addr {
                    if !ipv4.is_loopback() {
                        return Ok(device.clone());
                    }
                }
            }
        }
    }
    
    Ok(devices[0].clone())
}

pub struct AsyncCapture {
    capture: Capture<Active>,
}

impl AsyncCapture {
    pub fn new(device: Device) -> Result<Self> {
        let mut cap = Capture::from_device(device)?
            .promisc(true)
            .snaplen(65535)
            .timeout(10)
            .immediate_mode(true)
            .open()?;
        
        cap.filter("ip", true)?;
        Ok(Self { capture: cap })
    }

    pub fn next_packet(&mut self) -> Option<NetPacket> {
        match self.capture.next_packet() {
            Ok(pkt) => {
                let data = pkt.data;
                if data.len() < 34 {
                    return None;
                }
                
                let ether_type = u16::from_be_bytes([data[12], data[13]]);
                let ip_start = if ether_type == 0x0800 {
                    14
                } else if ether_type == 0x8100 {
                    18
                } else {
                    return None;
                };

                if data.len() < ip_start + 20 {
                    return None;
                }

                let version_ihl = data[ip_start];
                let version = version_ihl >> 4;
                let ihl = (version_ihl & 0x0F) as usize * 4;

                if version != 4 || data.len() < ip_start + ihl {
                    return None;
                }

                let protocol_byte = data[ip_start + 9];
                let src_ip = IpAddr::V4(Ipv4Addr::new(
                    data[ip_start + 12],
                    data[ip_start + 13],
                    data[ip_start + 14],
                    data[ip_start + 15],
                ));
                let dst_ip = IpAddr::V4(Ipv4Addr::new(
                    data[ip_start + 16],
                    data[ip_start + 17],
                    data[ip_start + 18],
                    data[ip_start + 19],
                ));

                let protocol = match protocol_byte {
                    6 => "TCP",
                    17 => "UDP",
                    1 => "ICMP",
                    _ => "UNKNOWN",
                };

                let mut src_port = 0;
                let mut dst_port = 0;

                if (protocol == "TCP" || protocol == "UDP") && data.len() >= ip_start + ihl + 4 {
                    let port_start = ip_start + ihl;
                    src_port = u16::from_be_bytes([data[port_start], data[port_start + 1]]);
                    dst_port = u16::from_be_bytes([data[port_start + 2], data[port_start + 3]]);
                }

                Some(NetPacket {
                    timestamp: Utc::now(),
                    src_ip,
                    dst_ip,
                    src_port,
                    dst_port,
                    protocol: protocol.to_string(),
                    size: pkt.header.len as usize,
                    raw_info: None,
                })
            }
            Err(pcap::Error::TimeoutExpired) => None,
            Err(_) => None,
        }
    }
}
