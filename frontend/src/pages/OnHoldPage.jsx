import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";
import { formatNumber } from "../utils/format";

const userRoles = new Set(["USER", "MEMBER", "ELDER"]);

export default function OnHoldPage() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [usersRes, productsRes, permissionsRes] = await Promise.all([
      api.getUsers(token),
      api.getFinishedGoods(token),
      api.getPermissions(token),
    ]);

    setUsers((usersRes.data || []).filter((user) => userRoles.has(user.role)));
    setProducts(productsRes.data || []);
    setPermissions(permissionsRes.data || []);
  }, [token]);

  useDataRefresh(load, "on-hold");

  useEffect(() => {
    load().catch((error) => {
      showToast({
        tone: "error",
        title: "Load failed",
        message: error.message || "Could not load on-hold products.",
      });
    });
  }, [load, showToast]);

  const hiddenProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const deniedKeys = new Set(
      permissions
        .filter((permission) => Number(permission.can_view) === 0)
        .map(
          (permission) =>
            `${Number(permission.user_id)}:${Number(permission.finished_good_id)}`
        )
    );
    const activeProductIds = new Set();

    permissions.forEach((permission) => {
      const key = `${Number(permission.user_id)}:${Number(permission.finished_good_id)}`;

      if (Number(permission.can_view) === 1 && !deniedKeys.has(key)) {
        activeProductIds.add(Number(permission.finished_good_id));
      }
    });

    return products
      .filter(
        (product) =>
          Number(product.is_visible) !== 1 ||
          !activeProductIds.has(Number(product.id))
      )
      .filter((product) => {
        if (!q) return true;

        return (
          (product.name || "").toLowerCase().includes(q) ||
          (product.article_code || "").toLowerCase().includes(q) ||
          (product.sole_code || "").toLowerCase().includes(q) ||
          (product.color || "").toLowerCase().includes(q) ||
          (product.size || "").toLowerCase().includes(q)
        );
      });
  }, [permissions, products, search]);

  const toggleUser = (id) => {
    setSelectedUsers((current) =>
      current.includes(id)
        ? current.filter((userId) => userId !== id)
        : [...current, id]
    );
  };

  const toggleProduct = (id) => {
    setSelectedProducts((current) =>
      current.includes(id)
        ? current.filter((productId) => productId !== id)
        : [...current, id]
    );
  };

  const selectAllProducts = () => {
    setSelectedProducts(hiddenProducts.map((product) => product.id));
  };

  const clearSelection = () => {
    setSelectedUsers([]);
    setSelectedProducts([]);
  };

  const showSelectedProducts = async () => {
    if (!selectedUsers.length || !selectedProducts.length) {
      showToast({
        tone: "error",
        title: "Selection required",
        message: "Choose at least one user and one hidden product.",
      });
      return;
    }

    try {
      setSaving(true);

      await Promise.all(
        selectedProducts.map((id) =>
          api.setFinishedGoodVisibility(id, { is_visible: true }, token)
        )
      );

      await Promise.all(
        selectedUsers.map((userId) =>
          api.grantPermission(
            {
              user_id: Number(userId),
              finished_good_ids: selectedProducts.map(Number),
            },
            token
          )
        )
      );

      clearSelection();
      await load();
      announceDataRefresh("finished-goods");
      announceDataRefresh("permissions");
      announceDataRefresh("on-hold");

      showToast({
        tone: "success",
        title: "Products displayed",
        message: "Selected products are now visible to the selected users.",
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Update failed",
        message: error.message || "Could not display selected products.",
      });
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "select",
      label: "",
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedProducts.includes(row.id)}
          onChange={() => toggleProduct(row.id)}
          className="h-4 w-4 cursor-pointer accent-indigo-600"
        />
      ),
    },
    {
      key: "image_url",
      label: "Image",
      render: (row) =>
        row.image_url ? (
          <img
            src={`${APP_BASE_URL}${row.image_url}`}
            alt={row.name}
            className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
          />
        ) : (
          <div className="h-12 w-12 rounded-lg border border-slate-200 bg-slate-100" />
        ),
    },
    { key: "name", label: "Product" },
    { key: "article_code", label: "Article" },
    {
      key: "details",
      label: "Details",
      render: (row) => (
        <div className="space-y-1">
          <p>Sole: {row.sole_code || "-"}</p>
          <p>
            {row.color || "-"} / {row.size || "-"}
          </p>
        </div>
      ),
    },
    {
      key: "quantity",
      label: "Stock",
      render: (row) => `${formatNumber(row.quantity)} ${row.unit || "pairs"}`,
    },
    {
      key: "is_visible",
      label: "Status",
      render: () => <StatusBadge tone="neutral">On hold</StatusBadge>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Visibility"
        title="On Hold Products"
        description="Manage hidden products and products that are not visible to any user, member, or elder."
        icon="hidden"
      />

      <SectionCard
        title="Select Users"
        subtitle="The selected products will be displayed only to these users."
        icon="users"
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => {
            const active = selectedUsers.includes(user.id);

            return (
              <button
                key={user.id}
                type="button"
                onClick={() => toggleUser(user.id)}
                className={`rounded-xl border p-4 text-left transition ${
                  active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <p className="font-semibold">{user.name}</p>
                <p className="mt-1 text-sm text-slate-500">{user.email}</p>
                <p className="mt-2 text-xs font-medium uppercase text-slate-400">
                  {user.role}
                </p>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Hidden Products"
        subtitle="Hidden products and products with no active user access appear here."
        icon="eyeOff"
        actions={
          <>
            <Button variant="secondary" onClick={selectAllProducts}>
              Select all
            </Button>
            <Button variant="ghost" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              onClick={showSelectedProducts}
              disabled={saving || !selectedUsers.length || !selectedProducts.length}
              icon="eye"
            >
              {saving ? "Showing..." : "Show selected"}
            </Button>
          </>
        }
      >
        <div className="p-4">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search hidden products..."
            className="mb-4 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
          />

          <DataTable
            columns={columns}
            rows={hiddenProducts}
            emptyTitle="No hidden products"
            emptyDescription="Hidden products and products without permitted users appear here."
          />
        </div>
      </SectionCard>
    </div>
  );
}
