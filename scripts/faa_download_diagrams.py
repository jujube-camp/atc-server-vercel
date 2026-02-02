import re
import os
import requests
from bs4 import BeautifulSoup

if not os.path.exists("pdfs"):
    os.makedirs("pdfs")

states = '''California,加利福尼亚州,CA
Colorado,科罗拉多州,CO
Connecticut,康涅狄格州,CT
Delaware,特拉华州,DE
District of Columbia,哥伦比亚特区,DC
Florida,佛罗里达州,FL
Georgia,佐治亚州,GA
Hawaii,夏威夷州,HI
Idaho,爱达荷州,ID
Illinois,伊利诺伊州,IL
Indiana,印第安纳州,IN
Iowa,艾奥瓦州,IA
Kansas,堪萨斯州,KS
Kentucky,肯塔基州,KY
Louisiana,路易斯安那州,LA
Maine,缅因州,ME
Maryland,马里兰州,MD
Massachusetts,马萨诸塞州,MA
Michigan,密歇根州,MI
Minnesota,明尼苏达州,MN
Mississippi,密西西比州,MS
Missouri,密苏里州,MO
Montana,蒙大拿州,MT
Nebraska,内布拉斯加州,NE
Nevada,内华达州,NV
New Hampshire,新罕布什尔州,NH
New Jersey,新泽西州,NJ
New Mexico,新墨西哥州,NM
New York,纽约州,NY
North Carolina,北卡罗来纳州,NC
North Dakota,北达科他州,ND
Ohio,俄亥俄州,OH
Oklahoma,俄克拉荷马州,OK
Oregon,俄勒冈州,OR
Pacific Territories,太平洋领土,-
Pennsylvania,宾夕法尼亚州,PA
Puerto Rico,波多黎各,PR
Rhode Island,罗德岛州,RI
South Carolina,南卡罗来纳州,SC
South Dakota,南达科他州,SD
Tennessee,田纳西州,TN
Texas,得克萨斯州,TX
Utah,犹他州,UT
Vermont,佛蒙特州,VT
Virgin Islands,维尔京群岛,VI
Virginia,弗吉尼亚州,VA
Washington,华盛顿州,WA
West Virginia,西弗吉尼亚州,WV
Wisconsin,威斯康星州,WI
Wyoming,怀俄明州,WY'''

for state in states.split('\n'): 
    state = state.split(',')[2]
    if not os.path.exists(os.path.join("pdfs", state)):
        os.makedirs(os.path.join("pdfs", state))
        
    for page in range(1, 3):
        URL = f"https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/results/?cycle=2511&diagrams=1&state={state}&page={page}"

        # 获取网页内容
        print("Fetching page...")
        resp = requests.get(URL)
        resp.raise_for_status()
        html = resp.text

        soup = BeautifulSoup(html, "html.parser")

        # 匹配PDF链接，且包含 'ad'
        pdf_links = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "pdf" in href and "ad" in href:
                pdf_links.append(href)

        print(f"Found {len(pdf_links)} {state} PDF links containing 'ad'")

        # 下载PDF
        for link in pdf_links:
            # 补全相对路径
            if link.startswith("/"):
                link = "https://aeronav.faa.gov" + link
            elif link.startswith("https://"):
                pass
            else:
                link = "https://aeronav.faa.gov/d-tpp/" + link

            # 提取 nameddest=(XXX)
            m = re.search(r"#nameddest=\(([^)]+)\)", link)
            if not m:
                print(f"⚠️ Skip (no airport name): {link}")
                continue
            code = m.group(1).strip().upper()
            if len(code) == 3:
                filename = f"K{code}.pdf"
            else:
                filename = f"{code}.pdf"

            filepath = os.path.join("pdfs", state, filename)
            
            print(f"Downloading {filename} ...")

            # 下载PDF
            pdf_resp = requests.get(link.split("#")[0])
            pdf_resp.raise_for_status()
            with open(filepath, "wb") as f:
                f.write(pdf_resp.content)

print("✅ All downloads completed.")
