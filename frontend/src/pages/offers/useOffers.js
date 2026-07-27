import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { getCustomerVisibleStock } from "../../utils/displayStock";

export default function useOffers({ token, canManage, navigate }) {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartLoaded, setCartLoaded] = useState(false);

  const loadOffers = useCallback(async () => {
    const [result, usersResult] = await Promise.all([
      canManage
        ? api.getFinishedGoods(token)
        : api.getAvailability(token, { offer_view: 1 }),
      canManage ? api.getUsers(token) : Promise.resolve({ data: [] }),
    ]);
    setProducts(result.data || []);
    setCustomers(
      (usersResult.data || []).filter((account) => account.role === "USER")
    );
  }, [canManage, token]);

  useEffect(() => {
    loadOffers().catch(console.error);
  }, [loadOffers]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("userCart");
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) setCart(parsed);
    } catch (error) {
      console.error("Failed to load cart:", error);
    } finally {
      setCartLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (cartLoaded) {
      localStorage.setItem("userCart", JSON.stringify(cart));
    }
  }, [cart, cartLoaded]);

  const cartProductIds = useMemo(
    () => new Set(cart.map((item) => Number(item.finished_good_id))),
    [cart]
  );
  const totalCartItems = cart.reduce(
    (sum, item) => sum + Number(item.qty_ordered || 0),
    0
  );

  const addProductToCart = useCallback(
    (product) => {
      const productId = Number(product.id);
      if (cartProductIds.has(productId)) {
        navigate("/order-customer");
        return;
      }

      const availableQty = getCustomerVisibleStock(product);
      if (availableQty <= 0) return;

      setCart((current) => [
        ...current,
        {
          finished_good_id: productId,
          qty_ordered: 1,
          orderBy:
            Number(product.inner_boxes_per_outer_box) > 0
              ? "cartons"
              : "pairs",
          product: {
            id: productId,
            name: product.name || "",
            article_code: product.article_code || "",
            color: product.color || "",
            size: product.size || "",
            image_url: product.image_url || "",
            unit: product.unit || "pcs",
            inner_boxes_per_outer_box: Number(
              product.inner_boxes_per_outer_box || 0
            ),
            quantity: Number(
              product.physical_stock ?? product.quantity ?? 0
            ),
            display_stock: availableQty,
            available_qty: availableQty,
          },
        },
      ]);
    },
    [cartProductIds, navigate]
  );

  return {
    products,
    customers,
    cartProductIds,
    totalCartItems,
    loadOffers,
    addProductToCart,
  };
}
