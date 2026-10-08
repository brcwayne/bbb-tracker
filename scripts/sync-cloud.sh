#!/usr/bin/env bash
# ==============================================================================
# BBB Cloud Sync Helper (Oracle VM <-> Local Mac)
# ==============================================================================
set -euo pipefail

SSH_KEY="${HOME}/.ssh/oracle_bbb"
VM_HOST="ubuntu@130.210.62.219"
VM_DATA_DIR="/home/ubuntu/bbb-telegram-bot/data"
VM_BBB_DATA_DIR="/home/ubuntu/BBB/data"
LOCAL_DATA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data"

FILES=(
    "transactions.json"
    "cashflows.json"
    "brokers.json"
    "instruments.json"
    "fxrates.json"
    "portfolios.json"
    "personal_accounts.json"
    "snapshots.json"
    "personal_tx.json"
    "categories.json"
    "debts.json"
    "people.json"
    "payment_plans.json"
    "recurring_rules.json"
)

check_ssh() {
    if ! ssh -i "${SSH_KEY}" -o ConnectTimeout=4 -o StrictHostKeyChecking=no "${VM_HOST}" "true" 2>/dev/null; then
        echo "❌ Oracle VM bağlantısı kurulamadı (${VM_HOST}). SSH anahtarını kontrol edin."
        return 1
    fi
}

cmd_status() {
    check_ssh
    echo "🔍 Bulut ve Yerel Veri Durumu Kontrol Ediliyor..."
    
    local_count=0
    if [ -f "${LOCAL_DATA_DIR}/transactions.json" ]; then
        local_count=$(python3 -c "import json; print(len(json.load(open('${LOCAL_DATA_DIR}/transactions.json'))))" 2>/dev/null || echo "0")
    fi
    
    vm_count=$(ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${VM_HOST}" \
        "python3 -c \"import json; print(len(json.load(open('${VM_BBB_DATA_DIR}/transactions.json'))))\"" 2>/dev/null || echo "0")

    local_personal_count=0
    if [ -f "${LOCAL_DATA_DIR}/personal_tx.json" ]; then
        local_personal_count=$(python3 -c "import json; print(len(json.load(open('${LOCAL_DATA_DIR}/personal_tx.json'))))" 2>/dev/null || echo "0")
    fi

    vm_personal_count=$(ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${VM_HOST}" \
        "python3 -c \"import json; print(len(json.load(open('${VM_BBB_DATA_DIR}/personal_tx.json'))))\"" 2>/dev/null || echo "0")
    
    echo "  - Yatırım (Borsa) İşlem Sayısı: Yerel=${local_count} | Bulut (VM)=${vm_count}"
    echo "  - Kişisel Harcama İşlem Sayısı: Yerel=${local_personal_count} | Bulut (VM)=${vm_personal_count}"
    
    if [ "${local_count}" -eq "${vm_count}" ] && [ "${local_personal_count}" -eq "${vm_personal_count}" ]; then
        echo "✅ Yerel ve Bulut senkronize görünüyor."
    elif [ "${local_count}" -lt "${vm_count}" ] || [ "${local_personal_count}" -lt "${vm_personal_count}" ]; then
        echo "⚠️ Bulutta yerelden daha fazla işlem var! './scripts/sync-cloud.sh pull' çalıştırmanız önerilir."
    else
        echo "ℹ️ Yerelde buluttan daha fazla işlem var! './scripts/sync-cloud.sh push' ile yükleyebilirsiniz."
    fi
}

cmd_pull() {
    check_ssh
    echo "⬇️ Buluttan (Oracle VM) yerele veri çekiliyor..."
    mkdir -p "${LOCAL_DATA_DIR}"
    for f in "${FILES[@]}"; do
        scp -q -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${VM_HOST}:${VM_BBB_DATA_DIR}/${f}" "${LOCAL_DATA_DIR}/${f}" 2>/dev/null || \
        scp -q -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${VM_HOST}:${VM_DATA_DIR}/${f}" "${LOCAL_DATA_DIR}/${f}" 2>/dev/null || true
    done
    echo "✅ Veriler buluttan çekildi ve yerel güncellendi."
    cmd_status
}

cmd_push() {
    check_ssh
    echo "⬆️ Yerelden buluta (Oracle VM + Google Drive) veri gönderiliyor..."
    local_files=()
    for f in "${FILES[@]}"; do
        if [ -f "${LOCAL_DATA_DIR}/${f}" ]; then
            local_files+=("${LOCAL_DATA_DIR}/${f}")
        fi
    done
    if [ ${#local_files[@]} -gt 0 ]; then
        scp -q -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${local_files[@]}" "${VM_HOST}:${VM_DATA_DIR}/"
        scp -q -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${local_files[@]}" "${VM_HOST}:${VM_BBB_DATA_DIR}/"
    fi
    echo "☁️ Google Drive senkronizasyonu tetikleniyor..."
    ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${VM_HOST}" "/home/ubuntu/bbb-push.sh"
    echo "✅ Yerel veriler Oracle VM ve Google Drive'a başarıyla yüklendi."
    cmd_status
}

case "${1:-status}" in
    status)
        cmd_status
        ;;
    pull)
        cmd_pull
        ;;
    push)
        cmd_push
        ;;
    *)
        echo "Kullanım: $0 {status|pull|push}"
        exit 1
        ;;
esac
