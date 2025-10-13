var chart_order = null

function chart_order_update() {
    if (chart_order == null) {
        return
    }

    // 現在の表示モードを確認して適切なデータで更新
    const isMonthly = document.getElementById('chart_monthly_view') &&
                     document.getElementById('chart_monthly_view').checked

    if (isMonthly && order_info && order_info['month_data_available']) {
        // 月別表示モード
        chart_order.data.labels = order_info['by_month']['labels']
        chart_order.data.datasets[0].data = order_info['by_month']['count']
        chart_order.data.datasets[1].data = order_info['by_month']['price']
    } else if (order_info) {
        // 年別表示モード
        const yearLabels = order_info['year_list'].slice().reverse().map((year) => year + '年')
        chart_order.data.labels = yearLabels
        chart_order.data.datasets[0].data = order_info['by_year']['count'].slice().reverse()
        chart_order.data.datasets[1].data = order_info['by_year']['price'].slice().reverse()
    }

    chart_order.update()
}

function chart_order_create(order_info) {
    ctrl_elem = document.getElementById('chart_ctrl')
    ctrl_elem.style.display = 'block'

    if (chart_order != null) {
        chart_order.destroy()
    }

    chart_order = new Chart(document.getElementById('chart_order'), {
        type: 'bar',
        data: {
            labels: order_info['year_list'].reverse().map((year) => {
                return year + '年'
            }),
            datasets: [
                {
                    label: '注文件数',
                    yAxisID: 'count',
                    data: order_info['by_year']['count'].reverse(),
                    backgroundColor: '#ffc107'
                },
                {
                    label: '注文金額',
                    yAxisID: 'price',
                    data: order_info['by_year']['price'].reverse(),
                    backgroundColor: '#fd7e14'
                }
            ]
        },
        options: {
            responsive: true,
            title: {
                display: true,
                text: '合計購入金額'
            },
            scales: {
                count: {
                    title: {
                        text: '件数',
                        display: true
                    },
                    type: 'linear',
                    position: 'left',
                    suggestedMin: 0,
                    suggestedMax: 10,
                    grid: {
                        display: false
                    },
                    ticks: {
                        callback: function (value, index, values) {
                            return value.toLocaleString() + '件'
                        }
                    }
                },
                price: {
                    title: {
                        text: '金額',
                        display: true
                    },
                    type: 'linear',
                    position: 'right',
                    suggestedMin: 0,
                    suggestedMax: 10000,
                    ticks: {
                        callback: function (value, index, values) {
                            if (document.getElementById('chart_display_price').checked) {
                                return value.toLocaleString() + '円'
                            } else {
                                return ''
                            }
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            if (context.datasetIndex == 0) {
                                return context.parsed.y.toLocaleString() + '件'
                            } else {
                                return context.parsed.y.toLocaleString() + '円'
                            }
                        }
                    }
                }
            }
        }
    })

    // イベントハンドラーの設定
    setup_chart_event_handlers()
}

function chart_order_toggle_view() {
    if (!chart_order || !order_info) return

    const isMonthly = document.getElementById('chart_monthly_view').checked

    if (isMonthly && order_info['month_data_available']) {
        // 月別表示
        chart_order.data.labels = order_info['by_month']['labels']
        chart_order.data.datasets[0].data = order_info['by_month']['count']
        chart_order.data.datasets[1].data = order_info['by_month']['price']
    } else {
        // 年別表示
        const yearLabels = order_info['year_list'].slice().reverse().map((year) => year + '年')
        chart_order.data.labels = yearLabels
        chart_order.data.datasets[0].data = order_info['by_year']['count'].slice().reverse()
        chart_order.data.datasets[1].data = order_info['by_year']['price'].slice().reverse()
    }

    chart_order.update()
}

function setup_chart_event_handlers() {
    // 価格表示チェックボックス
    document.getElementById('chart_display_price').onchange = function () {
        chart_order_update()
    }

    // 月別表示チェックボックス
    document.getElementById('chart_monthly_view').onchange = function () {
        chart_order_toggle_view()
    }
}
