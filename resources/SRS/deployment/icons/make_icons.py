import fitz, os
here = os.path.dirname(os.path.abspath(__file__))
cols = {'vercel': '#000000', 'render': '#000000', 'neon': '#00B37E', 'nvidia': '#76B900', 'googlegemini': '#8E75B2'}
for n, c in cols.items():
    s = open(os.path.join(here, n + '.svg'), encoding='utf8').read()
    s = s.replace('<svg ', '<svg fill="%s" ' % c, 1)
    d = fitz.open(stream=s.encode(), filetype='svg')
    p = d[0]
    z = 512 / max(p.rect.width, p.rect.height)
    p.get_pixmap(matrix=fitz.Matrix(z, z), alpha=True).save(os.path.join(here, n + '.png'))
    print(n, 'ok')
