define(['resources/dompurify/purify.min'], function(DOMPurify) {
  'use strict';

  var formattingProperties = [
    'color', 'background-color', 'font-family', 'font-size', 'font-weight',
    'font-style', 'text-align', 'text-decoration', 'text-indent', 'text-shadow',
    'line-height', 'letter-spacing', 'word-spacing', 'white-space',
    'vertical-align', 'list-style-type'
  ];

  function cssValue(property, value) {
    if (typeof value !== 'string' || /[<>]/.test(value)) {
      return '';
    }
    var declaration = document.createElement('span').style;
    declaration.setProperty(property, value);
    return declaration.getPropertyValue(property);
  }

  function sanitizeFragment(html) {
    if (typeof html !== 'string' || !html.trim()) {
      return document.createDocumentFragment();
    }
    if (!DOMPurify || !DOMPurify.isSupported) {
      throw new Error('Cascade print requires a supported HTML sanitizer');
    }
    var fragment = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'div', 'span', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'small', 'sub', 'sup',
        'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'a', 'img',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style',
        'width', 'height', 'dir', 'lang', 'colspan', 'rowspan', 'scope',
        'start', 'reversed', 'type'
      ],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      RETURN_DOM_FRAGMENT: true
    });
    Array.prototype.forEach.call(fragment.querySelectorAll('[style]'), function(element) {
      var original = element.style;
      var clean = document.createElement('span').style;
      formattingProperties.forEach(function(property) {
        var value = cssValue(property, original.getPropertyValue(property));
        if (value) {
          clean.setProperty(property, value);
        }
      });
      element.removeAttribute('style');
      if (clean.cssText) {
        element.setAttribute('style', clean.cssText);
      }
    });
    Array.prototype.forEach.call(fragment.querySelectorAll('a, img'), function(element) {
      var attribute = element.tagName === 'A' ? 'href' : 'src';
      var value = element.getAttribute(attribute);
      if (value) {
        var link = document.createElement('a');
        link.href = value;
        var allowed = /^https?:$/.test(link.protocol)
          || attribute === 'href' && /^(mailto|tel):$/.test(link.protocol);
        if (!allowed) {
          element.removeAttribute(attribute);
        }
      }
      if (element.tagName === 'A' && element.getAttribute('target') === '_blank') {
        element.setAttribute('rel', 'noopener noreferrer');
      }
    });
    return fragment;
  }

  function toReact(html, React) {
    var attributeNames = { 'class': 'className', colspan: 'colSpan', rowspan: 'rowSpan' };
    function renderNode(node, index) {
      if (node.nodeType === 3) {
        return node.nodeValue;
      }
      if (node.nodeType !== 1) {
        return null;
      }
      var props = { key: index };
      Array.prototype.forEach.call(node.attributes, function(attribute) {
        if (attribute.name === 'style') {
          var style = {};
          formattingProperties.forEach(function(property) {
            var value = node.style.getPropertyValue(property);
            if (value) {
              var name = property.replace(/-([a-z])/g, function(match, letter) {
                return letter.toUpperCase();
              });
              style[name] = value;
            }
          });
          props.style = style;
        }
        else {
          props[attributeNames[attribute.name] || attribute.name] = attribute.name === 'reversed' ? true : attribute.value;
        }
      });
      if (!node.childNodes.length) {
        return React.createElement(node.localName, props);
      }
      return React.createElement(node.localName, props, Array.prototype.map.call(node.childNodes, renderNode));
    }
    return Array.prototype.map.call(sanitizeFragment(html).childNodes, renderNode);
  }

  function themeStyles(settings, customBackground) {
    var theme = settings && settings.theme || {};
    var fonts = theme.fonts || {};
    var title = cssValue('font-family', fonts.titleFont && fonts.titleFont.fontFamily);
    var body = cssValue('font-family', fonts.bodyFont && fonts.bodyFont.fontFamily);
    var background = customBackground && cssValue('background-color', theme.colors && theme.colors.bgMain);
    var styles = [];
    if (title) {
      styles.push('h1, h2, h3, h4, h5, h6 { font-family: ' + title + ';}');
    }
    if (body) {
      styles.push('body { font-family: ' + body + ';}');
    }
    if (background) {
      styles.push('.bg-custom:not(figure), .bg-custom img { background: ' + background + ';}');
    }
    return styles.join(' ');
  }

  return { toReact: toReact, themeStyles: themeStyles };
});
