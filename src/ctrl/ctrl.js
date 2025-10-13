var start_time = null
var item_list = null
var order_info = null

function state_init() {
    start_time = new Date()
    item_list = []
    order_info = {
        year_list: [],
        count_total: 0,
        count_done: 0,
        price_total: 0,
        by_year: {}
    }

    document.getElementById('status').value = ''
    notify_progress()
}

function year_index(year) {
    index = 0
    for (y of order_info['year_list']) {
        if (y == year) {
            return index
        }
        index++
    }
}

function notify_progress() {
    document.getElementById('order_count_done').innerText = order_info['count_done'].toLocaleString()

    // 月指定モードで件数計算中の場合は推定値表示
    if (order_info['mode'] === 'month' && !order_info['month_count_calculated']) {
        document.getElementById('order_count_total').innerText = order_info['count_total'].toLocaleString() + '(推定)'
    } else {
        document.getElementById('order_count_total').innerText = order_info['count_total'].toLocaleString()
    }

    document.getElementById('order_price_total').innerText = order_info['price_total'].toLocaleString()

    var done_rate
    if (order_info['count_done'] == 0) {
        done_rate = 0
    } else {
        // 月指定モードで推定中は100%を超えないように制限
        if (order_info['mode'] === 'month' && !order_info['month_count_calculated'] && order_info['count_done'] > order_info['count_total']) {
            done_rate = 100
        } else {
            done_rate = (100 * order_info['count_done']) / order_info['count_total']
        }
    }

    progress_bar = document.getElementById('progress_bar')
    progress_bar.innerText = Math.round(done_rate) + '%'
    progress_bar.style.width = Math.round(done_rate) + '%'

    if (done_rate > 0.1 && done_rate < 100) {
        now = new Date()
        elapsed_sec = Math.round((now.getTime() - start_time.getTime()) / 1000)
        remaining_sec = (elapsed_sec / done_rate) * (100 - done_rate)

        var remaining_text
        if (remaining_sec < 300) {
            remaining_text = Math.round(remaining_sec) + '秒'
        } else {
            remaining_text = Math.round(remaining_sec / 60).toLocaleString() + '分'
        }

        document.getElementById('remaining_time').innerText = remaining_text
    } else {
        document.getElementById('remaining_time').innerText = '?'
    }
    chart_order_update()
}

function getNewFileHandle() {
    const options = {
        types: [
            {
                description: 'CSV Files',
                accept: {
                    'text/csv': ['.csv']
                }
            }
        ]
    }
    return window.showSaveFilePicker(options)
}

function csv_escape(str) {
    if (typeof str === 'string') {
        if (str.includes('"') || str.includes(',')) {
            return '"' + str.replace(/"/g, '""') + '"'
        } else {
            return str
        }
    } else {
        return str
    }
}

function csv_convert(item_list) {
    content_list = [
        // NOTE: エンコーディングが UTF-8 固定になるので，Excel で開いたときの文字化け防止のため，
        // 先頭に BOM をつける．
        new TextDecoder('utf-8', { ignoreBOM: true }).decode(new Uint8Array([0xef, 0xbb, 0xbf]))
    ]
    console.log(content_list)
    param_list = [
        ['date', '購入日'],
        ['name', '名前'],
        ['quantity', '数量'],
        ['price', '価格'],
        ['seller', '販売元'],
        ['asin', 'asin'],
        ['url', 'URL'],
        ['img_url', 'サムネイルURL']
    ]
    for (param of param_list) {
        content_list.push(csv_escape(param[1]))
        content_list.push(', ')
    }
    content_list.pop()
    content_list.push('\n')

    for (item of item_list) {
        for (param of param_list) {
            content_list.push(csv_escape(item[param[0]]))
            content_list.push(',')
        }
        content_list.pop()
        content_list.push('\n')
    }
    return content_list.join('')
}

async function write(item_list) {
    const handle = await getNewFileHandle()

    const writable = await handle.createWritable()
    await writable.write(csv_convert(item_list))
    //    await writable.write(JSON.stringify(data))
    await writable.close()
}

document.getElementById('save').onclick = function () {
    write(item_list)
}

// 実行順序を保ちながら非同期でリストに対して処理を実行
function async_loop(list, index, func, next) {
    return new Promise(function (resolve, reject) {
        if (index == list.length) {
            return resolve(false)
        }
        func(list[index], index, function () {
            return resolve(true)
        })
    }).then(function (is_continue) {
        if (is_continue) {
            return async_loop(list, index + 1, func, next)
        } else {
            next()
        }
    })
}

function get_detail_in_order(order, index, mode, year, callback) {
    cmd_handle(
        {
            to: 'background',
            type: 'parse',
            target: 'detail',
            date: order['date'],
            index: index,
            mode: mode,
            url: order['url']
        },
        function (response) {
            order_info['count_done'] += 1

            if (typeof response === 'undefined') {
                status_error('意図しないエラーが発生しました．')
                return callback()
            }

            if (typeof response === 'string') {
                return callback()
            }

            for (item of response['list']) {
                item['date'] = response['date']
                item_list.push(item)
                order_info['price_total'] += item['price']
                order_info['by_year']['price'][year_index(year)] += item['price']
                chart_order_update()
            }
            notify_progress()
            callback(response)
        }
    )
}

function get_item_in_year(year, page, callback) {
    cmd_handle(
        {
            to: 'background',
            type: 'parse',
            target: 'list',
            year: year,
            page: page,
            page_total: Math.ceil(order_info['by_year']['count'][year_index(year)] / 10),
            month: order_info['target_month'] || null  // 月指定モードの場合
        },
        function (response) {
            return new Promise(function (resolve) {
                var orders_to_process = response['list']

                // 月指定モードの場合、該当月の注文のみフィルタリング
                if (order_info['mode'] === 'month' && order_info['target_month']) {
                    const targetMonth = order_info['target_month']
                    const targetYear = order_info['target_year']

                    orders_to_process = response['list'].filter(order => {
                        // 日付形式: "2025/10/13"
                        const dateParts = order.date.split('/')
                        const orderYear = parseInt(dateParts[0])
                        const orderMonth = parseInt(dateParts[1])
                        return orderYear === targetYear && orderMonth === targetMonth
                    })

                    // 初回ページで月の合計件数を集計
                    if (page === 1 && !order_info['month_count_calculated']) {
                        // 全ページの月別件数を事前計算するフラグ
                        order_info['month_orders_found'] = orders_to_process.length
                        order_info['month_count_calculating'] = true
                    } else if (order_info['month_count_calculating']) {
                        order_info['month_orders_found'] += orders_to_process.length
                    }
                }

                // 直近10件モードの場合は、取得する注文を制限
                if (order_info['limit_count'] > 0) {
                    var remaining = order_info['limit_count'] - order_info['count_done']
                    if (remaining <= 0) {
                        callback()
                        return
                    }
                    orders_to_process = orders_to_process.slice(0, remaining)
                }

                async_loop(
                    orders_to_process,
                    0,
                    function (order, index, order_callback) {
                        var mode = 0
                        if (index == 0) {
                            mode |= 0x01
                        }
                        if (index == orders_to_process.length - 1) {
                            mode |= 0x10
                        }
                        get_detail_in_order(order, index, mode, year, order_callback)
                    },
                    function () {
                        // 月指定モードの場合、全ページを確認する
                        if (order_info['mode'] === 'month') {
                            if (!response['is_last']) {
                                return get_item_in_year(year, page + 1, callback)
                            } else {
                                // 最終ページに到達したら、実際の月の件数で更新
                                if (order_info['month_count_calculating']) {
                                    order_info['month_count_calculating'] = false
                                    order_info['month_count_calculated'] = true

                                    // 総件数を実際の月の件数に更新
                                    const actualCount = order_info['month_orders_found']
                                    order_info['count_total'] = actualCount
                                    order_info['by_year']['count'][0] = actualCount  // 月指定は1年のみなので[0]

                                    status_info(`${order_info['target_year']}年${order_info['target_month']}月: ${actualCount}件の注文が見つかりました`)
                                    notify_progress()
                                }
                                callback()
                            }
                        }
                        // 直近10件モードの場合、10件処理したら終了
                        else if (order_info['limit_count'] > 0 && order_info['count_done'] >= order_info['limit_count']) {
                            callback()
                        } else if (response['is_last']) {
                            callback()
                        } else {
                            return get_item_in_year(year, page + 1, callback)
                        }
                    }
                )
            })
        }
    )
}

function get_order_count_in_year(year, callback) {
    cmd_handle(
        {
            to: 'background',
            type: 'parse',
            target: 'order_count',
            year: year
        },
        function (response) {
            var count = response['count']

            // 月指定モードの場合、実際の件数は後で判明するので暫定値を使用
            if (order_info['mode'] === 'month') {
                // 暫定的に年全体の件数を設定（後で実際の月の件数に更新される）
                status_info(`${year}年${order_info['target_month']}月の注文を確認中... (年間${count}件から検索)`)
                // 見積もり値として年間件数の1/12を設定（暫定）
                count = Math.ceil(count / 12)
            }
            // 直近10件モードの場合は、カウントを10に制限
            else if (order_info['limit_count'] > 0 && count > order_info['limit_count']) {
                count = order_info['limit_count']
            }

            order_info['count_total'] += count
            order_info['by_year']['count'][year_index(year)] = count

            notify_progress()
            callback()
        }
    )
}

async function get_year_list() {
    new Promise((resolve) => {
        cmd_handle(
            {
                to: 'background',
                type: 'parse',
                target: 'year_list'
            },
            function (response) {
                // NOTE: for DEBUG
                // response['list'] = [2013, 2012, 2011, 2010, 2009, 2008, 2007]
                // response['list'] = [2002, 2001]
                // response['list'] = [2005,2004,2003,2002,2001]

                const mode = document.getElementById('mode').value
                year_list = response['list']

                order_info['mode'] = mode
                order_info['limit_count'] = 0

                if (mode === 'recent') {
                    // 直近10件の場合は最新年のみ、後で件数制限する
                    year_list = year_list.slice(0, 1)
                    order_info['limit_count'] = 10
                } else if (mode === 'years') {
                    // 年数指定モード
                    const yearCount = parseInt(document.getElementById('year-count').value, 10)
                    year_list = year_list.slice(0, yearCount)
                } else if (mode === 'month') {
                    // 月指定モード
                    const selectedYear = parseInt(document.getElementById('year-select').value, 10)
                    const selectedMonth = parseInt(document.getElementById('month-select').value, 10)

                    // 選択された年のみを処理対象にする
                    if (year_list.includes(selectedYear)) {
                        year_list = [selectedYear]
                        order_info['target_month'] = selectedMonth
                        order_info['target_year'] = selectedYear
                    } else {
                        // 選択された年にデータがない場合
                        status_error(selectedYear + '年のデータがありません')
                        document.getElementById('start').disabled = false
                        return
                    }
                }
                // mode === 'all' の場合は全年を処理

                order_info['year_list'] = year_list

                order_info['by_year']['count'] = new Array(year_list.length).fill(0)
                order_info['by_year']['price'] = new Array(year_list.length).fill(0)

                chart_order_create(order_info)
                resolve(year_list)
            }
        )
    })
        .then((year_list) => {
            return new Promise(function (resolve) {
                async_loop(
                    year_list,
                    0,
                    function (year, index, callback) {
                        get_order_count_in_year(year, callback)
                    },
                    function () {
                        year_list = resolve(year_list)
                    }
                )
            })
        })
        .then((year_list) => {
            return new Promise(function (resolve) {
                async_loop(
                    year_list,
                    0,
                    function (year, index, callback) {
                        get_item_in_year(year, 1, callback)
                    },
                    resolve
                )
            })
        })
        .then(() => {
            status_info('完了しました．')

            order_info['count_total'] = order_info['count_done']
            notify_progress()

            worker_destroy()

            document.getElementById('start').disabled = false
        })
}

// モード切り替え時の表示制御
document.getElementById('mode').onchange = function() {
    const mode = document.getElementById('mode').value
    const yearCount = document.getElementById('year-count')
    const monthSelectors = document.getElementById('month-selectors')
    const settingsCol = document.getElementById('settings-col')

    // 全要素を非表示
    yearCount.style.display = 'none'
    monthSelectors.style.display = 'none'

    // 選択モードに応じて表示制御
    if (mode === 'years') {
        yearCount.style.display = 'block'
        settingsCol.style.display = 'block'
    } else if (mode === 'month') {
        monthSelectors.style.display = 'block'
        settingsCol.style.display = 'block'
        // 年のセレクトボックスを初期化（まだ年リストを取得していない場合）
        initYearSelector()
    } else {
        // 'all' または 'recent' の場合は設定列を非表示
        settingsCol.style.display = 'none'
    }
}

// 年セレクタの初期化
function initYearSelector() {
    const yearSelect = document.getElementById('year-select')
    if (yearSelect.options.length === 0) {
        // 現在の年から過去10年分を生成
        const currentYear = new Date().getFullYear()
        for (let year = currentYear; year >= currentYear - 10; year--) {
            const option = document.createElement('option')
            option.value = year
            option.textContent = year + '年'
            yearSelect.appendChild(option)
        }
        // 現在の月をデフォルト選択
        const currentMonth = new Date().getMonth() + 1
        document.getElementById('month-select').value = currentMonth
    }
}

// ページロード時の初期化
window.addEventListener('DOMContentLoaded', function() {
    // 初期状態でのレイアウト設定
    const mode = document.getElementById('mode').value
    const settingsCol = document.getElementById('settings-col')

    // デフォルト状態では設定列を非表示
    if (mode === 'all' || mode === 'recent') {
        settingsCol.style.display = 'none'
    }
})

document.getElementById('start').onclick = function () {
    document.getElementById('start').disabled = true

    status_info('開始します．')

    state_init()

    worker_init().then(() => {
        get_year_list()
    })
}
