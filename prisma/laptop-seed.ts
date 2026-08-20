import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

/**
 * Laptop seed for the current Prisma schema.
 *
 * Notes:
 * - Images are intentionally left null / [] so you can add them manually.
 * - Each CPU/RAM configuration is a separate Product instead of a ProductVariant.
 *   This makes your existing ProductAttribute.value based filtering much easier.
 * - Stock is stored in the default ProductVariant because your current schema has stock there.
 * - Products where you did not provide quantity use stock: 0.
 * - "HP 15 Coming Model" is intentionally a placeholder. Replace its exact model/spec/price later.
 * - Prices are Bangladesh market starter values researched around Aug 2026 and should be rechecked before launch.
 */

type SeedProduct = {
  name: string;
  slug: string;
  sku: string;
  brand: "Dell" | "HP" | "Lenovo";
  price: number;
  stock: number;
  description: string;
  specs: Record<string, string>;
};

const priceSegment = (price: number) => {
  if (price <= 0) return "TBA";
  if (price < 55000) return "Under 55K";
  if (price <= 70000) return "55K–70K";
  if (price <= 90000) return "70K–90K";
  if (price <= 120000) return "90K–120K";
  if (price <= 170000) return "120K–170K";
  return "170K+";
};

const products: SeedProduct[] = [
  {
    name: "Dell Inspiron 15 3530 Core i5-1334U 8GB 512GB SSD",
    slug: "dell-inspiron-15-3530-core-i5-1334u-8gb-512gb",
    sku: "DELL-INS3530-I5-8-512",
    brand: "Dell",
    price: 68500,
    stock: 15,
    description:
      "Dell Inspiron 15 3530 with 13th Gen Intel Core i5-1334U, 8GB DDR4 RAM, 512GB NVMe SSD and 15.6-inch Full HD display. Suitable for office, study, browsing and general productivity.",
    specs: {
      "Processor Brand": "Intel",
      "Processor Type.": "Core i5-1334U",
      Generation: "13th Gen",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "8GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 NVMe PCIe",
      "Installed SSD Generation": "PCIe",
      "Graphics Memory": "Shared",
      "Panel Type": "WVA / LED",
      "Display Refresh Rate": "120Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "DDR4",
      "Empty/Expansion RAM Slot": "Upgradeable",
      "Max. RAM Support": "16GB+",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "Intel UHD Graphics",
      LAN: "No",
      "Finger Print Sensor": "Yes",
      "Keyboard Back-lit": "No",
      "Operating System": "Windows 11 Home",
      "Licensed Application": "Microsoft 365 Trial",
      Color: "Carbon Black / Platinum Silver",
      "Weight Range (Kg)": "1.5–2.0 Kg",
      "Warranty Info": "3 Years",
    },
  },
  {
    name: "Dell Vostro 15 3530 Core i3-1305U 8GB 512GB SSD",
    slug: "dell-vostro-15-3530-core-i3-1305u-8gb-512gb",
    sku: "DELL-VOS3530-I3-8-512",
    brand: "Dell",
    price: 55000,
    stock: 15,
    description:
      "Dell Vostro 15 3530 business laptop with Intel Core i3-1305U, 8GB DDR4 RAM, 512GB NVMe SSD and 15.6-inch FHD anti-glare display.",
    specs: {
      "Processor Brand": "Intel",
      "Processor Type.": "Core i3-1305U",
      Generation: "13th Gen",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "8GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 NVMe",
      "Installed SSD Generation": "PCIe",
      "Graphics Memory": "Shared",
      "Panel Type": "TN / LED",
      "Display Refresh Rate": "60Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "DDR4",
      "Empty/Expansion RAM Slot": "Yes",
      "Max. RAM Support": "16GB",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "Intel UHD Graphics",
      LAN: "Yes",
      "Finger Print Sensor": "No",
      "Keyboard Back-lit": "No",
      "Operating System": "FreeDOS",
      "Licensed Application": "No",
      Color: "Titan Grey",
      "Weight Range (Kg)": "1.5–2.0 Kg",
      "Warranty Info": "3 Years",
    },
  },
  {
    name: "HP Laptop 15-fd1086TU Core 5 120U 8GB 512GB SSD",
    slug: "hp-15-fd1086tu-core-5-120u-8gb-512gb",
    sku: "HP-15-FD1086TU-C5-8-512",
    brand: "HP",
    price: 82000,
    stock: 0,
    description:
      "HP Laptop 15-fd1086TU with Intel Core 5 120U, 8GB DDR4 memory, 512GB PCIe NVMe SSD and 15.6-inch FHD IPS anti-glare display.",
    specs: {
      "Processor Brand": "Intel",
      "Processor Type.": "Core 5 120U",
      Generation: "Intel Core Series 1",
      NPU: "No dedicated NPU",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "8GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 PCIe NVMe",
      "Installed SSD Generation": "PCIe",
      "Graphics Memory": "Shared",
      "Panel Type": "IPS",
      "Display Refresh Rate": "60Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "DDR4-3200",
      "Empty/Expansion RAM Slot": "Upgradeable",
      "Max. RAM Support": "16GB+",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "Intel Graphics",
      LAN: "No",
      "Finger Print Sensor": "No",
      "Keyboard Back-lit": "No",
      "Operating System": "FreeDOS 3.0",
      "Licensed Application": "No",
      Color: "Natural Silver",
      "Weight Range (Kg)": "1.5–2.0 Kg",
      "Warranty Info": "2 Years",
    },
  },
  {
    name: "Dell 15 DC15250 Core i5-1334U 8GB 512GB SSD",
    slug: "dell-15-dc15250-core-i5-1334u-8gb-512gb",
    sku: "DELL-DC15250-I5-8-512",
    brand: "Dell",
    price: 74500,
    stock: 15,
    description:
      "Dell 15 DC15250 with 13th Gen Intel Core i5-1334U, 8GB RAM, 512GB M.2 PCIe NVMe SSD and 15.6-inch FHD 120Hz WVA/IPS anti-glare display.",
    specs: {
      "Processor Brand": "Intel",
      "Processor Type.": "Core i5-1334U",
      Generation: "13th Gen",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "8GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 PCIe NVMe",
      "Installed SSD Generation": "PCIe",
      "Graphics Memory": "Shared",
      "Panel Type": "WVA / IPS",
      "Display Refresh Rate": "120Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "DDR4",
      "Empty/Expansion RAM Slot": "Yes",
      "Max. RAM Support": "16GB+",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "Intel UHD / Iris Xe Graphics",
      LAN: "No",
      "Finger Print Sensor": "Optional",
      "Keyboard Back-lit": "No",
      "Operating System": "FreeDOS",
      "Licensed Application": "No",
      Color: "Carbon Black",
      "Weight Range (Kg)": "1.5–2.0 Kg",
      "Warranty Info": "3 Years",
    },
  },
  {
    name: "Dell 15 DC15250 Core 3 100U 8GB 512GB SSD",
    slug: "dell-15-dc15250-core-3-100u-8gb-512gb",
    sku: "DELL-DC15250-C3-8-512",
    brand: "Dell",
    price: 62000,
    stock: 10,
    description:
      "Dell 15 DC15250 with Intel Core 3 100U, 8GB DDR4 RAM, 512GB M.2 PCIe NVMe SSD and 15.6-inch FHD 120Hz WVA/IPS anti-glare display.",
    specs: {
      "Processor Brand": "Intel",
      "Processor Type.": "Core 3 100U",
      Generation: "Intel Core Series 1",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "8GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 PCIe NVMe",
      "Installed SSD Generation": "PCIe",
      "Graphics Memory": "Shared",
      "Panel Type": "WVA / IPS",
      "Display Refresh Rate": "120Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "DDR4-3200",
      "Empty/Expansion RAM Slot": "Yes",
      "Max. RAM Support": "16GB+",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "Intel Graphics",
      LAN: "No",
      "Finger Print Sensor": "Optional",
      "Keyboard Back-lit": "No",
      "Operating System": "FreeDOS",
      "Licensed Application": "No",
      Color: "Carbon Black",
      "Weight Range (Kg)": "1.5–2.0 Kg",
      "Warranty Info": "2 Years",
    },
  },
  {
    name: "HP 15-fc0626AU Ryzen 3 7320U 8GB 512GB SSD",
    slug: "hp-15-fc0626au-ryzen-3-7320u-8gb-512gb",
    sku: "HP-15-FC0626AU-R3-8-512",
    brand: "HP",
    price: 66500,
    stock: 10,
    description:
      "HP 15-fc0626AU with AMD Ryzen 3 7320U, 8GB LPDDR5 memory, 512GB PCIe NVMe SSD and 15.6-inch FHD anti-glare display.",
    specs: {
      "Processor Brand": "AMD",
      "Processor Type.": "Ryzen 3 7320U",
      Generation: "Ryzen 7000 Series",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "8GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 PCIe NVMe",
      "Installed SSD Generation": "PCIe",
      "Graphics Memory": "Shared",
      "Panel Type": "LED",
      "Display Refresh Rate": "60Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "LPDDR5-5500",
      "Empty/Expansion RAM Slot": "No / Onboard RAM",
      "Max. RAM Support": "8GB",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "AMD Radeon Graphics",
      LAN: "No",
      "Finger Print Sensor": "No",
      "Keyboard Back-lit": "Yes",
      "Operating System": "Windows 11 Home / FreeDOS by region",
      "Licensed Application": "Microsoft 365 Trial",
      Color: "Natural Silver",
      "Weight Range (Kg)": "1.5–2.0 Kg",
      "Warranty Info": "2 Years",
    },
  },
  {
    name: "HP 15-fc0618AU Ryzen 5 7520U 16GB 512GB SSD",
    slug: "hp-15-fc0618au-ryzen-5-7520u-16gb-512gb",
    sku: "HP-15-FC0618AU-R5-16-512",
    brand: "HP",
    price: 67500,
    stock: 10,
    description:
      "HP 15-fc0618AU with AMD Ryzen 5 7520U, 16GB LPDDR5 memory, 512GB PCIe NVMe SSD, Radeon graphics and 15.6-inch FHD display.",
    specs: {
      "Processor Brand": "AMD",
      "Processor Type.": "Ryzen 5 7520U",
      Generation: "Ryzen 7000 Series",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "16GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 PCIe NVMe",
      "Installed SSD Generation": "PCIe",
      "Graphics Memory": "Shared",
      "Panel Type": "LED",
      "Display Refresh Rate": "60Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "LPDDR5-5500",
      "Empty/Expansion RAM Slot": "No / Onboard RAM",
      "Max. RAM Support": "16GB",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "AMD Radeon Graphics",
      LAN: "No",
      "Finger Print Sensor": "Yes",
      "Keyboard Back-lit": "Yes",
      "Operating System": "Windows 11 Home",
      "Licensed Application": "Microsoft 365 Trial",
      Color: "Moonlight Blue / Natural Silver",
      "Weight Range (Kg)": "1.5–2.0 Kg",
      "Warranty Info": "2 Years",
    },
  },
  {
    name: "HP 15 Coming Model",
    slug: "hp-15-coming-model",
    sku: "HP-15-COMING",
    brand: "HP",
    price: 0,
    stock: 5,
    description:
      "Placeholder for the upcoming HP 15 model. Replace name, processor, price and exact specifications after the final part number is confirmed.",
    specs: {
      "Processor Brand": "TBA",
      "Processor Type.": "TBA",
      Generation: "TBA",
      NPU: "TBA",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "TBA",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "TBA",
      "Installed SSD Type": "M.2 NVMe",
      "Installed SSD Generation": "TBA",
      "Graphics Memory": "TBA",
      "Panel Type": "TBA",
      "Display Refresh Rate": "TBA",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "TBA",
      "Touch Screen": "TBA",
      "RAM Type": "TBA",
      "Empty/Expansion RAM Slot": "TBA",
      "Max. RAM Support": "TBA",
      "HDD Expansion Slot": "TBA",
      "M.2/SSD Expansion Slot": "TBA",
      "Storage Upgrade": "TBA",
      "Graphics Chipset": "TBA",
      LAN: "TBA",
      "Finger Print Sensor": "TBA",
      "Keyboard Back-lit": "TBA",
      "Operating System": "TBA",
      "Licensed Application": "TBA",
      Color: "TBA",
      "Weight Range (Kg)": "TBA",
      "Warranty Info": "TBA",
    },
  },
  {
    name: "Lenovo IdeaPad Slim 3 15ABR8 Ryzen 5 5625U 8GB 512GB SSD",
    slug: "lenovo-ideapad-slim-3-15abr8-ryzen-5-5625u-8gb-512gb",
    sku: "LEN-SLIM3-15ABR8-R5-8-512",
    brand: "Lenovo",
    price: 74000,
    stock: 15,
    description:
      "Lenovo IdeaPad Slim 3 15ABR8 with AMD Ryzen 5 5625U, 8GB DDR4 memory, 512GB PCIe 4.0 NVMe SSD and 15.6-inch FHD anti-glare display.",
    specs: {
      "Processor Brand": "AMD",
      "Processor Type.": "Ryzen 5 5625U",
      Generation: "Ryzen 5000 Series",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "8GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 2242 NVMe",
      "Installed SSD Generation": "PCIe 4.0 x4",
      "Graphics Memory": "Shared",
      "Panel Type": "TN",
      "Display Refresh Rate": "60Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "DDR4-3200",
      "Empty/Expansion RAM Slot": "Model dependent",
      "Max. RAM Support": "16GB+",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "AMD Radeon Graphics",
      LAN: "No",
      "Finger Print Sensor": "No",
      "Keyboard Back-lit": "No",
      "Operating System": "FreeDOS",
      "Licensed Application": "No",
      Color: "Arctic Grey",
      "Weight Range (Kg)": "1.5–2.0 Kg",
      "Warranty Info": "2 Years",
    },
  },
  {
    name: "Lenovo IdeaPad Slim 3 15ABR8 Ryzen 7 5825U 16GB 512GB SSD",
    slug: "lenovo-ideapad-slim-3-15abr8-ryzen-7-5825u-16gb-512gb",
    sku: "LEN-SLIM3-15ABR8-R7-16-512",
    brand: "Lenovo",
    price: 90000,
    stock: 5,
    description:
      "Lenovo IdeaPad Slim 3 15ABR8 with AMD Ryzen 7 5825U, 16GB DDR4 RAM, 512GB NVMe SSD, 15.6-inch FHD IPS display, backlit keyboard and fingerprint reader.",
    specs: {
      "Processor Brand": "AMD",
      "Processor Type.": "Ryzen 7 5825U",
      Generation: "Ryzen 5000 Series",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "16GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 2242 NVMe",
      "Installed SSD Generation": "PCIe 4.0 x4",
      "Graphics Memory": "Shared",
      "Panel Type": "IPS",
      "Display Refresh Rate": "60Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "DDR4-3200",
      "Empty/Expansion RAM Slot": "Model dependent",
      "Max. RAM Support": "16GB+",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "AMD Radeon Graphics",
      LAN: "No",
      "Finger Print Sensor": "Yes",
      "Keyboard Back-lit": "Yes",
      "Operating System": "FreeDOS",
      "Licensed Application": "No",
      Color: "Abyss Blue / Arctic Grey",
      "Weight Range (Kg)": "1.5–2.0 Kg",
      "Warranty Info": "2 Years",
    },
  },
  {
    name: "Lenovo LOQ 15IRX9 Core i5-13450HX 16GB 512GB RTX 3050 6GB",
    slug: "lenovo-loq-15irx9-i5-13450hx-16gb-512gb-rtx-3050",
    sku: "LEN-LOQ15IRX9-I5-16-512-RTX3050",
    brand: "Lenovo",
    price: 139500,
    stock: 3,
    description:
      "Lenovo LOQ 15IRX9 gaming laptop with Intel Core i5-13450HX, 16GB DDR5, 512GB PCIe Gen4 NVMe SSD, GeForce RTX 3050 6GB and 15.6-inch FHD 144Hz display.",
    specs: {
      "Processor Brand": "Intel",
      "Processor Type.": "Core i5-13450HX",
      Generation: "13th Gen",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "16GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 NVMe",
      "Installed SSD Generation": "PCIe 4.0 x4",
      "Graphics Memory": "6GB GDDR6",
      "Panel Type": "IPS",
      "Display Refresh Rate": "144Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "DDR5-4800",
      "Empty/Expansion RAM Slot": "Yes",
      "Max. RAM Support": "32GB+",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "NVIDIA GeForce RTX 3050",
      LAN: "Yes",
      "Finger Print Sensor": "No",
      "Keyboard Back-lit": "RGB Backlit",
      "Operating System": "FreeDOS",
      "Licensed Application": "No",
      Color: "Luna Grey",
      "Weight Range (Kg)": "2.0–2.5 Kg",
      "Warranty Info": "2 Years",
    },
  },
  {
    name: "HP Victus 15-fa2393TX Core i5-13420H 16GB 512GB RTX 4050 6GB",
    slug: "hp-victus-15-fa2393tx-i5-13420h-16gb-512gb-rtx-4050",
    sku: "HP-VICTUS15-FA2393TX-I5-16-512-RTX4050",
    brand: "HP",
    price: 129500,
    stock: 2,
    description:
      "HP Victus 15-fa2393TX gaming laptop with Intel Core i5-13420H, 16GB RAM, 512GB PCIe Gen4 NVMe SSD, NVIDIA GeForce RTX 4050 6GB and 15.6-inch FHD 144Hz IPS display.",
    specs: {
      "Processor Brand": "Intel",
      "Processor Type.": "Core i5-13420H",
      Generation: "13th Gen",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "16GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 NVMe",
      "Installed SSD Generation": "PCIe Gen4",
      "Graphics Memory": "6GB GDDR6",
      "Panel Type": "IPS",
      "Display Refresh Rate": "144Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "DDR4-3200",
      "Empty/Expansion RAM Slot": "Yes",
      "Max. RAM Support": "32GB+",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "NVIDIA GeForce RTX 4050",
      LAN: "Yes",
      "Finger Print Sensor": "No",
      "Keyboard Back-lit": "Yes",
      "Operating System": "FreeDOS 3.0",
      "Licensed Application": "No",
      Color: "Mica Silver",
      "Weight Range (Kg)": "2.0–2.5 Kg",
      "Warranty Info": "2 Years",
    },
  },
  {
    name: "HP 15-fc0659AU Ryzen 5 7520U 16GB 512GB SSD",
    slug: "hp-15-fc0659au-ryzen-5-7520u-16gb-512gb",
    sku: "HP-15-FC0659AU-R5-16-512",
    brand: "HP",
    price: 85900,
    stock: 10,
    description:
      "HP 15-fc0659AU with AMD Ryzen 5 7520U, 16GB LPDDR5 RAM, 512GB PCIe NVMe M.2 SSD, Radeon graphics, 15.6-inch FHD display, fingerprint and backlit keyboard.",
    specs: {
      "Processor Brand": "AMD",
      "Processor Type.": "Ryzen 5 7520U",
      Generation: "Ryzen 7000 Series",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "16GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 PCIe NVMe",
      "Installed SSD Generation": "PCIe",
      "Graphics Memory": "Shared",
      "Panel Type": "LED",
      "Display Refresh Rate": "60Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "LPDDR5-5500",
      "Empty/Expansion RAM Slot": "No / Onboard RAM",
      "Max. RAM Support": "16GB",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "AMD Radeon Graphics",
      LAN: "No",
      "Finger Print Sensor": "Yes",
      "Keyboard Back-lit": "Yes",
      "Operating System": "Windows 11 Home",
      "Licensed Application": "Microsoft 365 Trial",
      Color: "Natural Silver",
      "Weight Range (Kg)": "1.5–2.0 Kg",
      "Warranty Info": "2 Years",
    },
  },
  {
    name: "Lenovo IdeaPad 1 15AMN7 Ryzen 5 7520U 16GB 512GB SSD",
    slug: "lenovo-ideapad-1-15amn7-ryzen-5-7520u-16gb-512gb",
    sku: "LEN-IP1-15AMN7-R5-16-512",
    brand: "Lenovo",
    price: 81000,
    stock: 0,
    description:
      "Lenovo IdeaPad 1 15AMN7 with AMD Ryzen 5 7520U, 16GB LPDDR5, 512GB PCIe 4.0 NVMe SSD and 15.6-inch FHD IPS anti-glare display.",
    specs: {
      "Processor Brand": "AMD",
      "Processor Type.": "Ryzen 5 7520U",
      Generation: "Ryzen 7000 Series",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "16GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 2242 NVMe",
      "Installed SSD Generation": "PCIe 4.0 x4",
      "Graphics Memory": "Shared",
      "Panel Type": "IPS",
      "Display Refresh Rate": "60Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "LPDDR5-5500",
      "Empty/Expansion RAM Slot": "No / Soldered",
      "Max. RAM Support": "16GB",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "AMD Radeon 610M Graphics",
      LAN: "No",
      "Finger Print Sensor": "No",
      "Keyboard Back-lit": "No",
      "Operating System": "FreeDOS",
      "Licensed Application": "No",
      Color: "Cloud Grey",
      "Weight Range (Kg)": "1.5–2.0 Kg",
      "Warranty Info": "2 Years",
    },
  },
  {
    name: "Lenovo ThinkPad E14 Gen 6 Ryzen 5 7535U 16GB 512GB SSD",
    slug: "lenovo-thinkpad-e14-gen-6-ryzen-5-7535u-16gb-512gb",
    sku: "LEN-THINKE14-G6-R5-16-512",
    brand: "Lenovo",
    price: 107000,
    stock: 0,
    description:
      "Lenovo ThinkPad E14 Gen 6 business laptop with AMD Ryzen 5 7535U, 16GB DDR5, 512GB SSD, Radeon 660M graphics, business security and upgradeable memory.",
    specs: {
      "Processor Brand": "AMD",
      "Processor Type.": "Ryzen 5 7535U",
      Generation: "Ryzen 7000 Series",
      NPU: "No dedicated NPU",
      "Display Size Range (Inch)": "14–15 Inch",
      RAM: "16GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 NVMe",
      "Installed SSD Generation": "PCIe Gen4",
      "Graphics Memory": "Shared",
      "Panel Type": "IPS",
      "Display Refresh Rate": "60Hz",
      "Display Resolution Range": "WUXGA / FHD+",
      "Display Resolution": "1920 x 1200",
      "Touch Screen": "No",
      "RAM Type": "DDR5-4800",
      "Empty/Expansion RAM Slot": "2 SODIMM Slots",
      "Max. RAM Support": "64GB",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Dual SSD capable",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "AMD Radeon 660M",
      LAN: "Yes",
      "Finger Print Sensor": "Yes",
      "Keyboard Back-lit": "Yes",
      "Operating System": "FreeDOS / Windows 11 Pro by config",
      "Licensed Application": "Lenovo Vantage",
      Color: "Graphite Black",
      "Weight Range (Kg)": "1.0–1.5 Kg",
      "Warranty Info": "2 Years",
    },
  },
  {
    name: "HP ProBook 450 G10 Core i7-1355U 8GB 512GB SSD",
    slug: "hp-probook-450-g10-core-i7-1355u-8gb-512gb",
    sku: "HP-PROBOOK450-G10-I7-8-512",
    brand: "HP",
    price: 109999,
    stock: 0,
    description:
      "HP ProBook 450 G10 business notebook with 13th Gen Intel Core i7-1355U, 8GB DDR4, 512GB PCIe NVMe SSD, 15.6-inch FHD IPS anti-glare display and commercial-grade security.",
    specs: {
      "Processor Brand": "Intel",
      "Processor Type.": "Core i7-1355U",
      Generation: "13th Gen",
      NPU: "No",
      "Display Size Range (Inch)": "15–16 Inch",
      RAM: "8GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 PCIe NVMe",
      "Installed SSD Generation": "PCIe",
      "Graphics Memory": "Shared",
      "Panel Type": "IPS",
      "Display Refresh Rate": "60Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "DDR4-3200",
      "Empty/Expansion RAM Slot": "2 RAM Slots",
      "Max. RAM Support": "32GB+",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "Intel Iris Xe Graphics",
      LAN: "Yes",
      "Finger Print Sensor": "Yes",
      "Keyboard Back-lit": "Yes",
      "Operating System": "Windows 11 Pro",
      "Licensed Application": "Microsoft 365 / OEM dependent",
      Color: "Pike Silver",
      "Weight Range (Kg)": "1.5–2.0 Kg",
      "Warranty Info": "3 Years / Seller dependent",
    },
  },
  {
    name: "Dell Latitude 3450 Core i5-1335U 8GB 512GB SSD",
    slug: "dell-latitude-3450-core-i5-1335u-8gb-512gb",
    sku: "DELL-LAT3450-I5-8-512",
    brand: "Dell",
    price: 95000,
    stock: 0,
    description:
      "Dell Latitude 3450 business laptop with Intel Core i5-1335U, 8GB DDR5, 512GB PCIe Gen4 SSD and 14-inch FHD anti-glare display.",
    specs: {
      "Processor Brand": "Intel",
      "Processor Type.": "Core i5-1335U",
      Generation: "13th Gen",
      NPU: "No",
      "Display Size Range (Inch)": "14–15 Inch",
      RAM: "8GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 NVMe",
      "Installed SSD Generation": "PCIe Gen4",
      "Graphics Memory": "Shared",
      "Panel Type": "IPS",
      "Display Refresh Rate": "60Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "DDR5-5200",
      "Empty/Expansion RAM Slot": "Yes",
      "Max. RAM Support": "64GB",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "Intel Iris Xe Graphics",
      LAN: "Yes",
      "Finger Print Sensor": "Optional",
      "Keyboard Back-lit": "Optional",
      "Operating System": "Windows 11 Pro / FreeDOS by config",
      "Licensed Application": "No",
      Color: "Grey",
      "Weight Range (Kg)": "1.0–1.5 Kg",
      "Warranty Info": "3 Years",
    },
  },
  {
    name: "Dell Latitude 5450 Core Ultra 5 125U 16GB 512GB SSD",
    slug: "dell-latitude-5450-core-ultra-5-125u-16gb-512gb",
    sku: "DELL-LAT5450-U5-16-512",
    brand: "Dell",
    price: 130000,
    stock: 0,
    description:
      "Dell Latitude 5450 business laptop with Intel Core Ultra 5 125U, 16GB DDR5, 512GB NVMe SSD, 14-inch FHD display, Wi-Fi 6E and backlit keyboard.",
    specs: {
      "Processor Brand": "Intel",
      "Processor Type.": "Core Ultra 5 125U",
      Generation: "Intel Core Ultra Series 1",
      NPU: "Intel AI Boost",
      "Display Size Range (Inch)": "14–15 Inch",
      RAM: "16GB",
      "Hard Disk Drive (HDD)": "No HDD",
      "Solid-State Drive (SSD)": "512GB",
      "Installed SSD Type": "M.2 NVMe",
      "Installed SSD Generation": "PCIe Gen4",
      "Graphics Memory": "Shared",
      "Panel Type": "IPS",
      "Display Refresh Rate": "60Hz",
      "Display Resolution Range": "Full HD",
      "Display Resolution": "1920 x 1080",
      "Touch Screen": "No",
      "RAM Type": "DDR5-5600",
      "Empty/Expansion RAM Slot": "2 RAM Slots",
      "Max. RAM Support": "64GB",
      "HDD Expansion Slot": "No",
      "M.2/SSD Expansion Slot": "Yes",
      "Storage Upgrade": "Yes",
      "Graphics Chipset": "Intel Graphics",
      LAN: "Yes",
      "Finger Print Sensor": "Optional",
      "Keyboard Back-lit": "Yes",
      "Operating System": "FreeDOS / Windows 11 Pro by config",
      "Licensed Application": "No",
      Color: "Grey",
      "Weight Range (Kg)": "1.0–1.5 Kg",
      "Warranty Info": "3 Years",
    },
  },
];

async function getOrCreateAttribute(name: string) {
  const existing = await prisma.attribute.findFirst({
    where: { name },
    orderBy: { id: "asc" },
  });
  if (existing) return existing;

  return prisma.attribute.create({
    data: { name },
  });
}

function normalizeSpecName(name: string) {
  return name === "Processor Type." ? "Processor Type" : name;
}

function getSpec(product: SeedProduct, name: string) {
  return product.specs[name] ?? product.specs[`${name}.`];
}

async function ensureProductAttribute(
  productId: number,
  attributeId: number,
  value: string,
) {
  const existing = await prisma.productAttribute.findFirst({
    where: { productId, attributeId },
    orderBy: { id: "asc" },
  });

  if (existing) {
    await prisma.productAttribute.update({
      where: { id: existing.id },
      data: { value },
    });
    return;
  }

  await prisma.productAttribute.create({
    data: { productId, attributeId, value },
  });
}

async function main() {
  const laptopCategory = await prisma.category.upsert({
    where: { slug: "laptops" },
    update: {
      name: "Laptops",
      deleted: false,
    },
    create: {
      name: "Laptops",
      slug: "laptops",
      deleted: false,
    },
  });

  const brands = new Map<string, { id: number }>();

  for (const name of ["Dell", "HP", "Lenovo"]) {
    const brand = await prisma.brand.upsert({
      where: { name },
      update: { deleted: false },
      create: {
        name,
        slug: name.toLowerCase(),
        deleted: false,
      },
      select: { id: true },
    });
    brands.set(name, brand);
  }

  const allAttributeNames = Array.from(
    new Set([
      "Price Segment",
      "Brand",
      ...products.flatMap((product) =>
        Object.keys(product.specs).map(normalizeSpecName),
      ),
    ]),
  );

  const attributeMap = new Map<string, number>();

  for (const attributeName of allAttributeNames) {
    const attribute = await getOrCreateAttribute(attributeName);
    attributeMap.set(attributeName, attribute.id);
  }

  for (const item of products) {
    const brand = brands.get(item.brand);
    if (!brand) throw new Error(`Brand not found: ${item.brand}`);

    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        sku: item.sku,
        categoryId: laptopCategory.id,
        brandId: brand.id,
        description: item.description,
        shortDesc: `${getSpec(item, "Processor Type") ?? ""} | ${getSpec(item, "RAM") ?? ""} RAM | ${getSpec(item, "Solid-State Drive (SSD)") ?? ""} SSD`,
        basePrice: item.price,
        originalPrice: null,
        currency: "BDT",
        available: true,
        featured: false,
        deleted: false,
        lowStockThreshold: 3,
      },
      create: {
        name: item.name,
        slug: item.slug,
        sku: item.sku,
        categoryId: laptopCategory.id,
        brandId: brand.id,
        description: item.description,
        shortDesc: `${getSpec(item, "Processor Type") ?? ""} | ${getSpec(item, "RAM") ?? ""} RAM | ${getSpec(item, "Solid-State Drive (SSD)") ?? ""} SSD`,
        basePrice: item.price,
        currency: "BDT",
        available: true,
        featured: false,
        image: null,
        gallery: [],
        lowStockThreshold: 3,
      },
    });

    // Keep one default inventory-bearing variant per exact configuration.
    const variantSku = `${item.sku}-DEFAULT`;
    const variantOptions = {
      Processor: getSpec(item, "Processor Type") ?? null,
      RAM: getSpec(item, "RAM") ?? null,
      SSD: getSpec(item, "Solid-State Drive (SSD)") ?? null,
      Color: getSpec(item, "Color") ?? null,
    };
    const existingVariant = await prisma.productVariant.findFirst({
      where: { productId: product.id, sku: variantSku },
      select: { id: true },
    });
    const variant = existingVariant
      ? await prisma.productVariant.update({
          where: { id: existingVariant.id },
          data: {
            price: item.price,
            currency: "BDT",
            options: variantOptions,
            isDefault: true,
            active: true,
            lowStockThreshold: 3,
          },
        })
      : await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: variantSku,
            price: item.price,
            currency: "BDT",
            stock: item.stock,
            options: variantOptions,
            isDefault: true,
            active: true,
            lowStockThreshold: 3,
          },
        });

    const warehouse = await prisma.warehouse.findFirst({
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
      select: { id: true },
    });

    if (warehouse) {
      await prisma.stockLevel.upsert({
        where: {
          warehouseId_productVariantId: {
            warehouseId: warehouse.id,
            productVariantId: variant.id,
          },
        },
        update: { quantity: item.stock },
        create: {
          warehouseId: warehouse.id,
          productVariantId: variant.id,
          quantity: item.stock,
          reserved: 0,
        },
      });

      const stockLevels = await prisma.stockLevel.findMany({
        where: { productVariantId: variant.id },
        select: { quantity: true, reserved: true },
      });
      const availableStock = stockLevels.reduce(
        (total, level) => total + Math.max(0, level.quantity - level.reserved),
        0,
      );
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { stock: availableStock },
      });
    } else {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { stock: item.stock },
      });
      console.warn(
        "No warehouse exists; kept seed quantity on ProductVariant.stock.",
      );
    }

    const attributes = {
      "Price Segment": priceSegment(item.price),
      Brand: item.brand,
      ...Object.fromEntries(
        Object.entries(item.specs).map(([name, value]) => [
          normalizeSpecName(name),
          value,
        ]),
      ),
    };

    for (const [name, value] of Object.entries(attributes)) {
      const attributeId = attributeMap.get(name);
      if (!attributeId) throw new Error(`Attribute not found: ${name}`);
      await ensureProductAttribute(product.id, attributeId, value);
    }

    console.log(
      `Seeded: ${item.name} | stock=${item.stock} | price=${item.price}`,
    );
  }

  console.log(`\nDone. Seeded ${products.length} laptop configurations.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
