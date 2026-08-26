# Aruna Review — Shopify

Projeto oficial do Aruna Review para Shopify.

## Arquitetura

- App Home: painel Aruna Review hospedado no backend próprio.
- Storefront: Theme App Extension (App Blocks), sem edição direta dos arquivos do tema.
- Avaliações: carregadas pela API pública do Aruna Review.
- Deploy: GitHub Actions + Shopify App Automation Token.

## Segurança

O repositório não contém Client Secret, App Automation Token ou service-role key.
O segredo `SHOPIFY_APP_AUTOMATION_TOKEN` deve existir apenas em GitHub Actions Secrets.

## Deploy

O workflow `.github/workflows/shopify-deploy.yml` executa o Shopify CLI com a configuração `production`.
