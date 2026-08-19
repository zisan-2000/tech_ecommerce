"use client";

import { useState } from "react";
import ProductReviews from "@/components/ecommarce/ProductReviews";

type ProductAttribute = {
  id: number;
  value: string;
  attribute: { name: string };
};

type ProductInformation = Array<{
  label: string;
  value: string;
}>;

const tabs = [
  { id: "specifications", label: "Specification" },
  { id: "description", label: "Description" },
  { id: "reviews", label: "Reviews" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function ProductDetailTabs({
  productId,
  description,
  attributes,
  information,
  reviewCount,
}: {
  productId: number;
  description: string;
  attributes: ProductAttribute[];
  information: ProductInformation;
  reviewCount: number;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("specifications");

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
      <div
        role="tablist"
        aria-label="Product details"
        className="flex overflow-x-auto border-b border-slate-200 px-3 sm:px-5"
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`product-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`product-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`relative h-12 shrink-0 px-4 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#174a92] sm:px-6 ${
                selected
                  ? "text-[#174a92] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#2563eb]"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
              {tab.id === "reviews" ? ` (${reviewCount})` : ""}
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-5">
        {activeTab === "specifications" ? (
          <div
            id="product-panel-specifications"
            role="tabpanel"
            aria-labelledby="product-tab-specifications"
          >
            <h2 className="text-[16px] font-bold uppercase tracking-wide text-slate-900">
              Specifications
            </h2>
            <dl className="mt-4 overflow-hidden rounded-lg border border-slate-200 text-[12px] sm:text-[13px]">
              {information.map((item, index) => (
                <div
                  key={item.label}
                  className={`grid grid-cols-[minmax(110px,0.65fr)_minmax(0,1.35fr)] ${
                    index > 0 ? "border-t border-slate-200" : ""
                  }`}
                >
                  <dt className="bg-slate-50 px-3 py-3 font-medium text-slate-600 sm:px-4">
                    {item.label}
                  </dt>
                  <dd className="px-3 py-3 font-semibold text-slate-800 sm:px-4">
                    {item.value}
                  </dd>
                </div>
              ))}
              {attributes.map((item, index) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-[minmax(110px,0.65fr)_minmax(0,1.35fr)] ${
                    information.length > 0 || index > 0
                      ? "border-t border-slate-200"
                      : ""
                  }`}
                >
                  <dt className="bg-slate-50 px-3 py-3 font-medium text-slate-600 sm:px-4">
                    {item.attribute.name}
                  </dt>
                  <dd className="px-3 py-3 font-semibold text-slate-800 sm:px-4">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {activeTab === "description" ? (
          <div
            id="product-panel-description"
            role="tabpanel"
            aria-labelledby="product-tab-description"
          >
            <h2 className="text-[16px] font-bold uppercase tracking-wide text-slate-900">
              Description
            </h2>
            <p className="mt-4 whitespace-pre-line text-[13px] leading-7 text-slate-600 sm:text-[14px]">
              {description || "Product description will be available soon."}
            </p>
          </div>
        ) : null}

        {activeTab === "reviews" ? (
          <div
            id="product-panel-reviews"
            role="tabpanel"
            aria-labelledby="product-tab-reviews"
          >
            <ProductReviews productId={productId} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
