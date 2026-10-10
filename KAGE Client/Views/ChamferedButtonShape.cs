using System.Windows;
using System.Windows.Media;
using System.Windows.Shapes;

namespace KAGE_Client.Views;

/// <summary>A button silhouette with equal, fixed-size 45-degree corner cuts.</summary>
public sealed class ChamferedButtonShape : Shape
{
    protected override Geometry DefiningGeometry
    {
        get
        {
            // Keep the entire outline inside the control, including its focus stroke.
            double inset = StrokeThickness / 2;
            double width = Math.Max(0, RenderSize.Width - StrokeThickness);
            double height = Math.Max(0, RenderSize.Height - StrokeThickness);
            if (width == 0 || height == 0)
                return Geometry.Empty;

            double cut = Math.Min(10, Math.Min(width, height) / 2);
            double right = inset + width;
            double bottom = inset + height;
            var geometry = new StreamGeometry();
            using (StreamGeometryContext context = geometry.Open())
            {
                context.BeginFigure(new Point(inset, inset), isFilled: true, isClosed: true);
                context.LineTo(new Point(right - cut, inset), true, false);
                context.LineTo(new Point(right, inset + cut), true, false);
                context.LineTo(new Point(right, bottom), true, false);
                context.LineTo(new Point(inset + cut, bottom), true, false);
                context.LineTo(new Point(inset, bottom - cut), true, false);
            }
            geometry.Freeze();
            return geometry;
        }
    }
}
