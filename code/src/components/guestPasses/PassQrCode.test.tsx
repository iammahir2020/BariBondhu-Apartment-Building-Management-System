/**
 * @jest-environment jsdom
 */
/**
 * Tests for a guest pass's QR code (RES-03 c1): it holds the pass code, and nothing shows if it can't be drawn.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import QRCode from 'qrcode';
import { PassQrCode } from './PassQrCode';

describe('PassQrCode', () => {
  it('draws the pass code as an SVG QR code (TC-R03-01)', async () => {
    render(<PassQrCode code="482913" />);
    const image = await screen.findByRole('img', { name: 'QR code for pass 482913' });
    const expected = await QRCode.toString('482913', {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    expect(image).toHaveAttribute(
      'src',
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(expected)}`,
    );
  });

  it('keeps a code with leading zeros as it is (TC-R03-10)', async () => {
    render(<PassQrCode code="004271" />);
    const image = await screen.findByRole('img', { name: 'QR code for pass 004271' });
    const expected = await QRCode.toString('004271', {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    expect(image.getAttribute('src')).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(expected)}`,
    );
  });

  it('shows nothing when the QR code cannot be drawn', async () => {
    const draw = jest.spyOn(QRCode, 'toString').mockImplementation(async () => {
      throw new Error('cannot draw');
    });
    const { container } = render(<PassQrCode code="482913" />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
    draw.mockRestore();
  });
});
