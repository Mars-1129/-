import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, CreateProductRequest, UpdateProductRequest } from '@tikstream/shared-types';
import { listProducts, createProduct, updateProduct } from '../../lib/api/products';

const STORAGE_KEY = 'tikstream-web-client:selected-product-id';

type WorkspaceState = {
  products: Product[];
  loading: boolean;
  error: string | null;
  selectedProductId: string | null;
  initialize: () => Promise<void>;
  refreshProducts: () => Promise<void>;
  setSelectedProductId: (productId: string) => void;
  addProduct: (data: CreateProductRequest) => Promise<Product>;
  updateProductInStore: (productId: string, data: UpdateProductRequest) => Promise<Product>;
};

async function fetchProducts(): Promise<Product[]> {
  const response = await listProducts({ page: 1, page_size: 50 });
  return response.items;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      products: [],
      loading: false,
      error: null,
      selectedProductId: null,
      initialize: async () => {
        if (get().loading || get().products.length > 0) {
          return;
        }

        set({ loading: true, error: null });

        try {
          const products = await fetchProducts();
          const currentProductId = get().selectedProductId;
          const nextProductId =
            currentProductId && products.some((product) => product.id === currentProductId)
              ? currentProductId
              : (products[0]?.id ?? null);

          set({ products, selectedProductId: nextProductId, loading: false, error: null });
        } catch (error) {
          set({
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to load product context',
          });
        }
      },
      refreshProducts: async () => {
        set({ loading: true, error: null });

        try {
          const products = await fetchProducts();
          const currentProductId = get().selectedProductId;
          const nextProductId =
            currentProductId && products.some((product) => product.id === currentProductId)
              ? currentProductId
              : (products[0]?.id ?? null);

          set({ products, selectedProductId: nextProductId, loading: false, error: null });
        } catch (error) {
          set({
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to refresh product context',
          });
        }
      },
      setSelectedProductId: (productId: string) => {
        set({ selectedProductId: productId });
      },
      addProduct: async (data: CreateProductRequest): Promise<Product> => {
        const newProduct = await createProduct(data);
        set((state) => ({
          products: [newProduct, ...state.products],
          selectedProductId: newProduct.id,
        }));
        return newProduct;
      },
      updateProductInStore: async (productId: string, data: UpdateProductRequest): Promise<Product> => {
        const updated = await updateProduct(productId, data);
        set((state) => ({
          products: state.products.map((p) => (p.id === productId ? updated : p)),
        }));
        return updated;
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ selectedProductId: state.selectedProductId }),
    },
  ),
);
