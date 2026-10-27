/* eslint brace-style: 0 */
/* eslint react/no-danger: "error" */
import React, { Component } from 'react';
import PrintSanitizer from 'storymaps/tpl/print/PrintSanitizer';

class Text extends Component {

  createMarkup(html) {
    if (!html || !html.trim()) {
      return [];
    }
    // strip background colors, add text shadow for lighter colors
    let colorAdjusted = html.replace(/background-color: rgba?\([^;]*;/g, '').replace(/color: rgb\([^;]*/g, (color) => {
      return this.maybeAddTextShadow(color);
    });
    return PrintSanitizer.toReact(colorAdjusted, React);
  }

  maybeAddTextShadow(colorStr) {
    const yiq = this.getYIQ(colorStr);
    if (yiq === null || yiq < 220) {
      return colorStr;
    }
    return `${colorStr}; text-shadow: 0 0 8px #000`;
  }

  getYIQ(colorStr) {
    const rgbStr = colorStr.match(/[0-9]*,\s?[0-9]*,\s?[0-9]*/);
    if (!rgbStr) {
      return colorStr;
    }
    const rgbArr = rgbStr[0].split(',');
    return (rgbArr[0] * 299 + rgbArr[1] * 587 + rgbArr[2] * 114) / 1000;
  }

  render() {
    const markup = this.createMarkup(this.props.text);
    if (this.props.tag === 'figcaption') {
      return (
        <figcaption>{markup}</figcaption>
      );
    }
    return (
      <div className="text-block">{markup}</div>
    );
  }
}

export default Text;
