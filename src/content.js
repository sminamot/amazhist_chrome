document.xpath = function (expression) {
    ret = document.evaluate(expression, document)

    switch (ret.resultType) {
        case 1:
            return ret.numberValue
        case 2:
            return ret.stringValue
        case 3:
            return ret.booleanValue
        case 4:
        case 5:
            var v = []
            while ((e = ret.iterateNext())) {
                v.push(e)
            }
            return v
        default:
            return ret
    }
}

function print_stacktrace(e) {
    log.error(e.message)
    log.error(e.stack)
}

function year_list_page_parse() {
    year_list = []

    const year_count = document.xpath(
        'count(//select[@id="time-filter"]/option[starts-with(@value, "year-")])'
    )

    for (var i = 0; i < year_count; i++) {
        const year_text = document
            .xpath(
                '//select[@id="time-filter"]/option[starts-with(@value, "year-")][' +
                    (i + 1) +
                    ']'
            )[0]
            .innerText.trim()

        year_list.push(parseInt(year_text.replace('年', '')))
    }

    return {
        list: year_list
    }
}

function order_count_page_parse() {
    const order_count_text = document
        .xpath('//label[@for="time-filter"]//span[contains(@class, "num-orders")]')[0]
        .innerText.trim()

    const order_count = parseInt(order_count_text.replace('件', ''))

    return {
        count: order_count
    }
}

function order_list_page_parse() {
    const order_count = document.xpath('count(//div[contains(@class, "order-card")])')
    log.info({ order_count: order_count })

    detail_page_list = []
    for (var i = 0; i < order_count; i++) {
        const parent_xpath = '//div[contains(@class, "order-card")][' + (i + 1) + ']'
        const date = document
            .xpath(parent_xpath + '//div[contains(@class, "order-header")]//span[contains(@class, "a-color-secondary") and contains(@class, "aok-break-word")]')[0]
            .innerText.trim()
        const url = document.xpath(parent_xpath + '//a[contains(text(), "注文内容を表示")]')[0].href

        detail_page_list.push({
            date: date.replace('年', '/').replace('月', '/').replace('日', ''), // 雑だけど動く
            url: url
        })
    }
    const is_last =
        document.xpath('count(//ul[contains(@class, "a-pagination")]/li[contains(@class, "a-last")]/a)') == 0

    return {
        list: detail_page_list,
        is_last: is_last
    }
}

function order_item_page_parse(parent_xpath) {
    // リンク要素を探す - 複数のパターンを試す
    var link = null
    var name = ''
    var url = ''
    var asin = ''

    // パターン1: 従来のセレクタ
    const linkNodes1 = document.xpath(parent_xpath + '//div[contains(@class, "a-col-right")]//a[contains(@class, "a-link-normal")]')
    // パターン2: 新しいセレクタ
    const linkNodes2 = document.xpath(parent_xpath + '//a[contains(@class, "a-link-normal")]')
    // パターン3: より汎用的なセレクタ
    const linkNodes3 = document.xpath(parent_xpath + '//a[@href and contains(@href, "/gp/product/") or contains(@href, "/dp/")]')

    if (linkNodes1.length > 0) {
        link = linkNodes1[0]
    } else if (linkNodes2.length > 0) {
        link = linkNodes2[0]
    } else if (linkNodes3.length > 0) {
        link = linkNodes3[0]
    } else {
        throw new Error('商品リンクが見つかりません')
    }

    name = link.innerText || link.textContent || ''
    url = link.href

    // ASINの抽出
    const asinMatch = url.match(/\/(dp|gp\/product)\/([^\/\?]+)/)
    if (asinMatch) {
        asin = asinMatch[2]
    } else {
        asin = 'unknown'
    }

    // 価格の取得
    var price = 0
    const priceNodes = document.xpath(parent_xpath + '//span[contains(@class, "a-color-price") or contains(@class, "a-price")]')
    if (priceNodes.length > 0) {
        const price_str = priceNodes[0].innerText
        const priceMatch = price_str.replace(/,/g, '').match(/[\d]+/)
        if (priceMatch) {
            price = parseInt(priceMatch[0], 10)
        }
    }

    // 販売者の取得
    var seller = 'Amazon'
    const sellerNodes = document.xpath(parent_xpath + '//span[contains(text(), "販売:") or contains(text(), "出品者:")]')
    if (sellerNodes.length > 0) {
        const seller_str = sellerNodes[0].innerText
        const sellerMatch = seller_str.match(/(販売|出品者):\s*(.+)$/)
        if (sellerMatch) {
            seller = sellerMatch[2].trim()
        }
    }

    // 画像URLの取得
    var img_url = ''
    const imgNodes = document.xpath(parent_xpath + '//img[@src]')
    if (imgNodes.length > 0) {
        img_url = imgNodes[0].currentSrc || imgNodes[0].src
    }

    // 数量の取得
    var quantity = 1
    const quantityNodes = document.xpath(parent_xpath + '//span[contains(@class, "item-view-qty") or contains(text(), "数量")]')
    if (quantityNodes.length > 0) {
        const qtyMatch = quantityNodes[0].innerText.match(/\d+/)
        if (qtyMatch) {
            quantity = parseInt(qtyMatch[0], 10)
            price *= quantity
        }
    }

    return {
        name: name,
        url: url,
        asin: asin,
        quantity: quantity,
        price: price,
        seller: seller,
        img_url: img_url
    }
}

function order_detail_page_parse_normal() {
    var item_list = []

    // 複数のセレクタパターンを試す（優先順位付き）
    const patterns = [
        {
            shipment: '//div[@id="od-shipments"]//div[contains(@class, "shipment")]',
            item: '//div[contains(@class, "a-row") and .//a[contains(@href, "/dp/") or contains(@href, "/gp/product/")]]'
        },
        {
            shipment: '//div[contains(@class, "a-box") and contains(@class, "shipment")]',
            item: '//div[contains(@class, "a-fixed-left-grid")]'
        },
        {
            shipment: '//div[contains(@class, "shipment-container")]',
            item: '//div[contains(@class, "a-row")]'
        },
        {
            shipment: '//div[contains(@class, "a-box")]',
            item: '//div[contains(@class, "a-row") and .//a]'
        }
    ]

    var ship_count = 0
    var shipmentXPath = ''
    var itemXPath = ''

    // 有効なパターンを見つける
    for (const pattern of patterns) {
        try {
            const testCount = document.xpath('count(' + pattern.shipment + ')')
            if (testCount > 0) {
                ship_count = testCount
                shipmentXPath = pattern.shipment
                itemXPath = pattern.item
                break
            }
        } catch (e) {
            // パターン失敗時は次を試す
        }
    }

    // 配送ボックスが見つからない場合、ページ全体から商品を探す
    if (ship_count === 0) {
        const itemSelectors = [
            '//div[@class="a-row" and .//a[contains(@href, "/dp/") or contains(@href, "/gp/product/")]]',
            '//div[contains(@class, "sc-list-item")]',
            '//div[contains(@class, "order-item")]',
            '//div[.//img and .//a[contains(@href, "/dp/") or contains(@href, "/gp/product/")]]'
        ]

        for (const selector of itemSelectors) {
            const itemCount = document.xpath('count(' + selector + ')')
            if (itemCount > 0) {
                for (var i = 0; i < itemCount && i < 20; i++) {
                    const parent_xpath = '(' + selector + ')[' + (i + 1) + ']'
                    try {
                        item = order_item_page_parse(parent_xpath)
                        if (item.name && item.name.length > 0) {
                            item_list.push(item)
                        }
                    } catch (e) {
                        // アイテムパースエラーは無視して次を試す
                    }
                }
                if (item_list.length > 0) {
                    break
                }
            }
        }
    } else {
        // 配送ボックスごとに処理
        for (var i = 0; i < ship_count; i++) {
            // XPathを正しく結合
            var fullItemXPath = ''
            if (itemXPath.startsWith('//')) {
                fullItemXPath = shipmentXPath + '[' + (i + 1) + ']' + itemXPath
            } else if (itemXPath.startsWith('.//') || itemXPath.startsWith('//')) {
                fullItemXPath = shipmentXPath + '[' + (i + 1) + ']/' + itemXPath.substring(1)
            } else {
                fullItemXPath = shipmentXPath + '[' + (i + 1) + ']//' + itemXPath
            }

            var item_count = 0
            try {
                item_count = document.xpath('count(' + fullItemXPath + ')')
            } catch (e) {
                // エラーの場合、配送ボックス内の全商品リンクを探す
                try {
                    const altXPath = shipmentXPath + '[' + (i + 1) + ']//a[contains(@href, "/dp/") or contains(@href, "/gp/product/")]/..'
                    item_count = document.xpath('count(' + altXPath + ')')
                    fullItemXPath = altXPath
                } catch (e2) {
                    // 代替パターンも失敗した場合は次の配送へ
                    continue
                }
            }

            for (var j = 0; j < item_count && j < 20; j++) {
                const parent_xpath = '(' + fullItemXPath + ')[' + (j + 1) + ']'
                try {
                    item = order_item_page_parse(parent_xpath)
                    if (item.name && item.name.length > 0) {
                        item_list.push(item)
                    }
                } catch (e) {
                    // アイテムパースエラーは無視して次を試す
                }
            }
        }
    }

    return {
        list: item_list
    }
}

function order_detail_page_parse_digital() {
    log.info('デジタル注文')

    const item_total_count = document.xpath(
        'count(//div[contains(@class, "a-box")]//div[contains(@class, "a-fixed-left-grid a-spacing-")])'
    )

    var item_list = []

    const item_count = document.xpath(
        'count(//div[contains(@class, "a-box")]//div[contains(@class, "a-fixed-left-grid a-spacing-")])'
    )
    for (var i = 0; i < item_count; i++) {
        const parent_xpath =
            '//div[contains(@class, "a-box")]' +
            '//div[contains(@class, "a-fixed-left-grid a-spacing-")][' +
            (i + 1) +
            ']'
        item = order_item_page_parse(parent_xpath)
        item_list.push(item)
    }

    log.info({ item_list: item_list })

    return {
        list: item_list
    }
}

function order_detail_page_parse() {
    try {
        // いくつかの配送ボックスパターンを試す
        const shipmentPatterns = [
            '//div[contains(@class, "a-box shipment")]',
            '//div[contains(@class, "shipment")]',
            '//div[@id="od-shipments"]//div[contains(@class, "a-box")]',
            '//div[contains(@class, "order-shipment")]'
        ]

        var shipmentCount = 0
        for (const pattern of shipmentPatterns) {
            const count = document.xpath('count(' + pattern + ')')
            if (count > 0) {
                shipmentCount = count
                break
            }
        }

        const orderElements = document.xpath('count(//a[contains(@href, "/gp/product/") or contains(@href, "/dp/")])')

        if (shipmentCount === 0) {
            // ページに商品リンクがある場合は通常注文として処理
            if (orderElements > 0) {
                return order_detail_page_parse_normal()
            } else {
                // デジタル注文として処理
                return order_detail_page_parse_digital()
            }
        } else {
            return order_detail_page_parse_normal()
        }
    } catch (e) {
        print_stacktrace(e)

        var amazon_msg = ''
        try {
            amazon_msg = document.xpath('//h4[contains(@class, "a-alert-heading")]')[0].innerText.trim()
        } catch (e) {}
        if (amazon_msg != '') {
            return '[amazon]' + amazon_msg
        } else {
            return e.message
        }
    }
}

function cmd_handler(cmd, sender, send_response) {
    if (cmd['to'] !== 'content') {
        return false
    }

    if (cmd['type'] === 'parse') {
        if (cmd['target'] === 'year_list') {
            send_response(year_list_page_parse())
        } else if (cmd['target'] === 'order_count') {
            send_response(order_count_page_parse())
        } else if (cmd['target'] === 'list') {
            send_response(order_list_page_parse())
        } else if (cmd['target'] === 'detail') {
            send_response(order_detail_page_parse())
        } else {
            log.error({
                msg: 'Unknown cmd target',
                cmd: cmd
            })
            send_response('ERROR: Unknown cmd target')
        }
    } else {
        log.error({
            msg: 'Unknown cmd type',
            cmd: cmd
        })
        send_response('ERROR: Unknown cmd type')
    }
}

chrome.runtime.onMessage.addListener(cmd_handler)
