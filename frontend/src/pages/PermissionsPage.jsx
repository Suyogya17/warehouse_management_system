import { useCallback, useEffect, useState, useMemo } from "react";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh, useDataRefresh } from "../hooks/useDataRefresh";
import { api, APP_BASE_URL } from "../services/api";

export default function PermissionsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [permissions, setPermissions] = useState([]);

  const [selectedUser, setSelectedUser] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);

  const [productSearch, setProductSearch] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  // PAGINATION STATES
  const [assignProductsPage, setAssignProductsPage] = useState(1);
  const [currentAccessPage, setCurrentAccessPage] = useState(1);
  const [systemOverviewPage, setSystemOverviewPage] = useState(1);
  const rowsPerPage = 10;

  // FILTER STATES
  const [currentAccessSearch, setCurrentAccessSearch] = useState("");
  const [systemOverviewSearch, setSystemOverviewSearch] = useState("");

  // LOAD DATA
  const load = useCallback(async () => {
    const [usersRes, productsRes, permsRes] = await Promise.all([
      api.getUsers(token),
      api.getFinishedGoods(token),
      api.getPermissions(token),
    ]);

    setUsers(usersRes.data || []);
    setProducts(productsRes.data || []);
    setPermissions(permsRes.data || []);
  }, [token]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  useDataRefresh(load, "permissions");

  // GRANT PERMISSION
  const grant = async () => {
    try {
      await api.grantPermission(
        {
          user_id: Number(selectedUser),
          finished_good_ids: selectedProducts.map(Number),
        },
        token
      );

      setSelectedProducts([]);
      await load();
      announceDataRefresh("permissions");
      showToast({ tone: "success", title: "Permission updated", message: "Product access was refreshed." });
    } catch (error) {
      showToast({ tone: "error", title: "Permission failed", message: error.message });
    }
  };

  // REVOKE PERMISSION
  const revoke = async (userId, productId) => {
    try {
      await api.revokePermission(
        { user_id: userId, finished_good_id: productId },
        token
      );

      await load();
      announceDataRefresh("permissions");
      showToast({ tone: "success", title: "Permission revoked", message: "Product access was refreshed." });
    } catch (error) {
      showToast({ tone: "error", title: "Revoke failed", message: error.message });
    }
  };

  const toggleProduct = (id) => {
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const userPermissions = permissions.filter(
    (p) => p.user_id === Number(selectedUser)
  );

  // FILTERED USER PERMISSIONS (CURRENT ACCESS)
  const filteredUserPermissions = useMemo(() => {
    return userPermissions.filter((p) => {
      const matchSearch =
        (p.product_name || "").toLowerCase().includes(currentAccessSearch.toLowerCase()) ||
        (p.article_code || "").toLowerCase().includes(currentAccessSearch.toLowerCase()) ||
        (p.sole_code || "").toLowerCase().includes(currentAccessSearch.toLowerCase()) ||
        (p.color || "").toLowerCase().includes(currentAccessSearch.toLowerCase());

      return matchSearch;
    });
  }, [userPermissions, currentAccessSearch]);

  // FILTERED SYSTEM OVERVIEW
  const filteredSystemOverview = useMemo(() => {
    return permissions.filter((p) => {
      const matchSearch =
        (p.user_name || "").toLowerCase().includes(systemOverviewSearch.toLowerCase()) ||
        (p.email || "").toLowerCase().includes(systemOverviewSearch.toLowerCase()) ||
        (p.product_name || "").toLowerCase().includes(systemOverviewSearch.toLowerCase()) ||
        (p.article_code || "").toLowerCase().includes(systemOverviewSearch.toLowerCase()) ||
        (p.sole_code || "").toLowerCase().includes(systemOverviewSearch.toLowerCase()) ||
        (p.color || "").toLowerCase().includes(systemOverviewSearch.toLowerCase());

      return matchSearch;
    });
  }, [permissions, systemOverviewSearch]);

  // FILTERED PRODUCTS (SEARCH + SELECTED FILTER)
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        (p.name || "").toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.article_code || "").toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.sole_code || "").toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.color || "").toLowerCase().includes(productSearch.toLowerCase());

      const matchSelected = showSelectedOnly
        ? selectedProducts.includes(p.id)
        : true;

      return matchSearch && matchSelected;
    });
  }, [products, productSearch, showSelectedOnly, selectedProducts]);

  // PAGINATED ASSIGN PRODUCTS
  const paginatedAssignProducts = useMemo(() => {
    const startIndex = (assignProductsPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return filteredProducts.slice(startIndex, endIndex);
  }, [filteredProducts, assignProductsPage]);

  const totalAssignPages = Math.ceil(filteredProducts.length / rowsPerPage);

  // PAGINATED CURRENT ACCESS
  const paginatedCurrentAccess = useMemo(() => {
    const startIndex = (currentAccessPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return filteredUserPermissions.slice(startIndex, endIndex);
  }, [filteredUserPermissions, currentAccessPage]);

  const totalCurrentAccessPages = Math.ceil(filteredUserPermissions.length / rowsPerPage);

  // PAGINATED SYSTEM OVERVIEW
  const paginatedSystemOverview = useMemo(() => {
    const startIndex = (systemOverviewPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return filteredSystemOverview.slice(startIndex, endIndex);
  }, [filteredSystemOverview, systemOverviewPage]);

  const totalSystemOverviewPages = Math.ceil(filteredSystemOverview.length / rowsPerPage);

  // PAGINATION COMPONENT
  const Pagination = ({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between mt-4 px-2">
        <div className="text-sm text-gray-500">
          Page {currentPage} of {totalPages}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Previous
          </button>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">

      {/* HEADER */}
      {/* <PageHeader
        eyebrow="Access Control"
        title="Permission Dashboard"
        description="Manage which finished goods each normal user can see, with product code, color, size, stock, and visibility details."
        icon="users"
      /> */}

      {/* ================= USER SELECTION ================= */}
      <SectionCard
        title="Step 1 — Select User"
        subtitle="Click a user to manage permissions"
        icon="users"
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {users
            .filter((u) => u.role === "USER")
            .map((u) => {
              const active = selectedUser === String(u.id);

              return (
                <div
                  key={u.id}
                  onClick={() => setSelectedUser(String(u.id))}
                  className={`cursor-pointer rounded-xl border p-4 transition shadow-sm hover:shadow-md ${
                    active
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="text-lg font-semibold">{u.name}</div>
                  <div className="text-sm text-gray-500">{u.email}</div>
                </div>
              );
            })}
        </div>
      </SectionCard>

      {/* ================= PRODUCT TABLE ================= */}
      {selectedUser && (
        <SectionCard
          title="Step 2 — Assign Products"
          subtitle="Search, filter and select products"
          icon="box"
        >

          {/* SEARCH + FILTER */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              placeholder="Search product name, article, sole, or color..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />

            <label className="flex items-center gap-2 text-sm whitespace-nowrap">
              <input
                type="checkbox"
                checked={showSelectedOnly}
                onChange={() => setShowSelectedOnly((v) => !v)}
              />
              Selected only
            </label>
          </div>

          {/* TABLE */}
          <div className="overflow-auto border rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-3 text-left">Select</th>
                  <th className="p-3 text-left">Image</th>
                  <th className="p-3 text-left">Article Name</th>
                  <th className="p-3 text-left">Details</th>
                  <th className="p-3 text-left">Stock</th>
                  <th className="p-3 text-left">Visible</th>
                </tr>
              </thead>

              <tbody>
                {paginatedAssignProducts.map((p) => {
                  const checked = selectedProducts.includes(p.id);

                  return (
                    <tr
                      key={p.id}
                      className={`border-t hover:bg-gray-50 ${
                        checked ? "bg-green-50" : ""
                      }`}
                    >
                      {/* CHECKBOX */}
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProduct(p.id)}
                        />
                      </td>

                      {/* IMAGE - FIXED */}
                      <td className="p-3">
                        {p.image_url ? (
                          <img
                            src={`${APP_BASE_URL}${p.image_url}`}
                            alt={p.name}
                            className="w-12 h-12 object-cover rounded-lg border"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-gray-200 rounded-lg border flex items-center justify-center text-xl">
                            📦
                          </div>
                        )}
                      </td>

                      {/* NAME */}
                      <td className="p-3 font-medium">
                        {p.name}
                      </td>

                      <td className="p-3 text-gray-500">
                        <div>Article: {p.article_code || "-"}</div>
                        <div>Sole: {p.sole_code || "-"}</div>
                        <div>Color/Size: {p.color || "-"} / {p.size || "-"}</div>
                      </td>

                      {/* STOCK */}
                      <td className="p-3 text-gray-500">
                        {p.quantity} {p.unit || "pairs"}
                      </td>

                      <td className="p-3 text-gray-500">
                        {p.is_visible === false ? "Hidden" : "Visible"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}
          <Pagination
            currentPage={assignProductsPage}
            totalPages={totalAssignPages}
            onPageChange={setAssignProductsPage}
          />

          {/* ACTION BAR */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Selected: <b>{selectedProducts.length}</b>
            </p>

            <Button
              onClick={grant}
              disabled={!selectedProducts.length}
            >
              Grant Access
            </Button>
          </div>
        </SectionCard>
      )}

      {/* ================= USER PERMISSIONS ================= */}
{selectedUser && (
  <SectionCard
    title="Current Access"
    subtitle="Products assigned to this user"
    icon="check"
  >
    {userPermissions.length === 0 ? (
      <p className="text-gray-500">No permissions yet.</p>
    ) : (
      <>
        {/* SEARCH FILTER */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search product name, article, sole, or color..."
            value={currentAccessSearch}
            onChange={(e) => setCurrentAccessSearch(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div className="overflow-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Image</th>
                <th className="text-left p-3">Article Name</th>
                <th className="text-left p-3">Details</th>
                <th className="text-left p-3">Stock</th>
                <th className="text-right p-3">Action</th>
              </tr>
            </thead>

            <tbody>
              {paginatedCurrentAccess.map((p) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">
                          {p.image_url ? (
                            <img
                              src={`${APP_BASE_URL}${p.image_url}`}
                              alt={p.name}
                              className="w-12 h-12 object-cover rounded-lg border"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-gray-200 rounded-lg border flex items-center justify-center text-xl">
                              📦
                            </div>
                          )}
                        </td>
                  
                  <td className="p-3 font-medium">
                  {p.product_name}
                  </td>

                  <td className="p-3 text-gray-500">
                    <div>Article: {p.article_code || "-"}</div>
                    <div>Sole: {p.sole_code || "-"}</div>
                    <div>Color/Size: {p.color || "-"} / {p.size || "-"}</div>
                  </td>

                  <td className="p-3 text-gray-500">
                  {p.quantity}
                  </td>

                  <td className="p-3 text-right">
                    <button
                      onClick={() => revoke(p.user_id, p.finished_good_id)}
                      className="text-red-600 text-sm hover:underline"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <Pagination
          currentPage={currentAccessPage}
          totalPages={totalCurrentAccessPages}
          onPageChange={setCurrentAccessPage}
        />
      </>
    )}
  </SectionCard>
)}

      {/* ================= SYSTEM OVERVIEW ================= */}
<SectionCard
  title="System Overview"
  subtitle="All user-product permissions"
  icon="dashboard"
>
  {permissions.length === 0 ? (
    <p className="text-gray-500">No permissions assigned yet.</p>
  ) : (
    <>
      {/* SEARCH FILTER */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search user, email, product name, article, sole, or color..."
          value={systemOverviewSearch}
          onChange={(e) => setSystemOverviewSearch(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <div className="overflow-auto border rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">User</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Article Name</th>
              <th className="text-left p-3">Details</th>
              <th className="text-left p-3">Stock</th>
              <th className="text-left p-3">Visible</th>
              <th className="text-right p-3">Action</th>
            </tr>
          </thead>

          <tbody>
            {paginatedSystemOverview.map((p) => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium">
                  {p.user_name}
                </td>

                <td className="p-3 text-gray-500">
                  {p.email}
                </td>

                <td className="p-3">
                {p.product_name}
                </td>

                <td className="p-3 text-gray-500">
                  <div>Article: {p.article_code || "-"}</div>
                  <div>Sole: {p.sole_code || "-"}</div>
                  <div>Color/Size: {p.color || "-"} / {p.size || "-"}</div>
                </td>

                <td className="p-3 text-gray-500">
                {p.quantity}
                </td>

                <td className="p-3 text-gray-500">
                  {p.is_visible === false ? "Hidden" : "Visible"}
                </td>

                <td className="p-3 text-right">
                  <button
                    onClick={() => revoke(p.user_id, p.finished_good_id)}
                    className="text-red-600 text-sm hover:underline"
                  >
                  Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <Pagination
        currentPage={systemOverviewPage}
        totalPages={totalSystemOverviewPages}
        onPageChange={setSystemOverviewPage}
      />
    </>
  )}
</SectionCard>
    </div>
  );
}