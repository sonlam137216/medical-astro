# Xuất bản nội dung (Publish → build → deploy)

Nút **Publish** trong `/admin/publish` không build trong Worker. Nó lưu một revision bất biến rồi nhờ GitHub Actions chạy workflow `.github/workflows/publish.yml`. Workflow build site từ đúng revision đó và deploy lên Cloudflare, rồi ghi tiến độ vào bảng `publish_jobs` để trang Publish hiển thị.

```
Admin bấm Publish
  → Worker: lưu content_revisions + publish_jobs (queued)
  → Worker gọi GitHub API (workflow_dispatch: job_id, revision_id, target)
  → GitHub Actions: queued → building → build (CONTENT_REVISION_ID) → wrangler deploy → deployed
                                              └─ lỗi ở bước nào: failed, bản đang live giữ nguyên
```

- **Cùng lúc chỉ một build** mỗi môi trường (`concurrency`). Publish mới trong lúc đang build thì chờ; Publish thứ ba thay thế bản đang chờ (job cũ thành `superseded`).
- **"Đã lưu" khác "đã live".** Trang Publish chỉ nói một revision là live khi job của nó đạt `deployed`.
- Build lỗi thì **không deploy**, bản trước vẫn được phục vụ. Nút **Build again** thử lại revision mới nhất.
- Job `building` quá 60 phút (runner chết) bị tự đánh dấu `failed` ở lần build kế tiếp.

## Thiết lập một lần

Làm theo thứ tự. Bước 1 và 5 cần chạy lệnh, các bước còn lại làm trên web.

1. **Đẩy code lên GitHub** (`git push`). Workflow phải có trên nhánh `main` thì GitHub mới chạy được.
2. **Cloudflare API token** (cho GitHub Actions deploy và đọc/ghi D1): dash.cloudflare.com → My Profile → API Tokens → Create Token → mẫu **Edit Cloudflare Workers**, rồi **thêm quyền Account → D1 → Edit** → chọn đúng tài khoản. Ghi lại cả **Account ID** (cột phải trang Workers & Pages).
3. **GitHub Environment `staging`**: repo → Settings → Environments → New environment → `staging`. Thêm **secrets**:

   | Secret                  | Giá trị        |
   | ----------------------- | -------------- |
   | `CLOUDFLARE_API_TOKEN`  | token ở bước 2 |
   | `CLOUDFLARE_ACCOUNT_ID` | Account ID     |

   Biến (Variables, không phải secret): **`D1_DATABASE_ID`** (id database của môi trường này, lấy từ `wrangler d1 create`, bắt buộc: build và script `publish-job` đọc/ghi D1 qua API Cloudflare bằng id này). Tuỳ chọn: `R2_PUBLIC_BASE_URL` (URL công khai của bucket khi đã có custom domain; để trống thì ảnh đi qua Worker).
   Khi làm production, tạo thêm environment `production` với bộ secret riêng và bật **Required reviewers** để có người duyệt trước khi deploy.

4. **Token cho Worker khởi động workflow** (không phải token ở bước 2): GitHub → Settings → Developer settings → Fine-grained personal access tokens → Generate. Chọn **Only select repositories** = repo này, quyền **Actions: Read and write** (Metadata read tự có). Đặt hạn ngắn (ví dụ 90 ngày) và ghi lịch gia hạn. Token này chỉ khởi động được workflow, không đọc được code.
5. **Đặt secret cho Worker rồi deploy** (tự nhập, đừng dán token vào chat):

   ```bash
   npx wrangler secret put GITHUB_DISPATCH_TOKEN --env staging
   npm run deploy:staging      # đưa các biến GITHUB_REPO, GITHUB_WORKFLOW, PUBLISH_TARGET lên Worker
   ```

   Với production: `--env` bỏ trống, và `PUBLISH_TARGET` của Worker production là `production` (khai báo trong `wrangler.jsonc`).

## Kiểm tra

1. Mở `/admin/publish`, sửa một bác sĩ rồi bấm **Publish**.
2. Trang báo "The build has been started". Trong tab Actions của repo thấy một lần chạy **Publish**.
3. Vài phút sau tải lại trang Publish: job thành `deployed` và mục **On the website** ghi revision mới.

## Sự cố thường gặp

| Dấu hiệu                                          | Nguyên nhân thường gặp                                                                                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The build trigger is not set up here"            | Worker thiếu secret `GITHUB_DISPATCH_TOKEN` (hoặc chạy local). Revision vẫn được lưu.                                                                                                        |
| Job `failed`: "GitHub did not accept the request" | Token hết hạn/thiếu quyền Actions, workflow chưa có trên `main`, hoặc sai `GITHUB_REPO`. Sửa rồi bấm **Build again**.                                                                        |
| Job `failed`: "The build did not complete"        | Mở **Build log** trên trang Publish. Hay gặp: sai secret trong GitHub Environment, token Cloudflare thiếu quyền (nhất là **D1: Edit**), thiếu biến `D1_DATABASE_ID`, bucket R2 chưa tồn tại. |
| Job `queued` mãi                                  | GitHub chưa chạy (đang chờ build trước) hoặc workflow bị tắt trong repo.                                                                                                                     |

## Lưu ý bảo mật

- `GITHUB_DISPATCH_TOKEN` và `CLOUDFLARE_API_TOKEN` (token này sửa được cả database) chỉ nằm ở secret của Worker hoặc GitHub Environment, không commit, không ra trình duyệt.
- Workflow ghi `.dev.vars` tạm trên máy chạy để build đọc được revision; file này không được commit và máy chạy bị huỷ sau mỗi lần.
- Script `scripts/publish-job.mjs` chỉ ghi id và thông báo cố định vào DB, không ghi output của build.
- **Staging và production dùng hai database D1 riêng** (`melatec-staging`, `melatec`), nên Publish ở staging không đụng dữ liệu production. Revision là bất biến, không xoá được: đừng Publish dữ liệu thử lên production.
- **Migration không tự chạy khi deploy.** Thay đổi schema thì chạy `npm run db:migrate:staging` / `db:migrate:production` trước khi deploy.
- Sau khi chạy `wrangler r2 bucket create` hoặc `wrangler d1 create`, mở lại `wrangler.jsonc`: lệnh này có thể tự thêm binding lạ (đã từng thêm `melatec_media`).
